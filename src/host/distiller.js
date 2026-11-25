import { SECTION_DETAIL_HEADING, SECTION_SUMMARY_HEADING } from "../shared/constants.js";
import { formatTurnRangeChinese, parseFoldMarkdown } from "../shared/markdown.js";
import { extractRangeTranscript } from "./inspector.js";

const DISTILL_SYSTEM_PROMPT = [
  "你是一个对话上下文局部折出（Context Fold）提炼引擎。",
  "用户正在进行发散性思考或方案推演，并在一段区间内穿插了具体数据验证、案例分析或支线探索。",
  "现在要把这段区间折出成一份「双层可编辑 Markdown 文档」，严格分成两个部分：",
  "",
  `1. ${SECTION_SUMMARY_HEADING}`,
  "   - 这部分会**直接替换原区间并注入回主线上下文**，因此必须极度精炼、高信噪比（建议 4–8 条短 bullet，控制在 180–400 中文字以内）。",
  "   - 重点保留：已验证的核心结论、被推翻的假设或反例、新涌现的直觉/灵感点、以及尚未解决的关键疑问。",
  "   - 严禁把未达成的分歧强行写死成“已确定共识”；未定项请明确标出「待定/有分歧」。",
  "   - 只写对话和工具结果里实际出现过的事实，禁止编造数据或代码细节。",
  "",
  `2. ${SECTION_DETAIL_HEADING}`,
  "   - 这部分**不进入主线上下文**，仅保存在磁盘供用户编辑和模型后续按需回查。",
  "   - 保留完整验证过程：涉及的具体标的/数据/时间点/文件/命令、推演逻辑、关键原始数字与踩坑记录。",
  "",
  "输出格式硬性要求：",
  "- 正文语言与原对话保持一致（原对话主要为英文时请用英文撰写正文内容，但下方两个二级标题保持固定不变）。",
  `- 直接输出以 "${SECTION_SUMMARY_HEADING}" 开头的 Markdown 正文，不要包在 \`\`\`markdown 代码块里，也不要写 YAML frontmatter。`,
  `- 必须包含 "${SECTION_SUMMARY_HEADING}" 和 "${SECTION_DETAIL_HEADING}" 两个二级标题。`,
].join("\n");

/**
 * Distill a selected range of events into `{ title, summary, details, generatedBy }`.
 * Uses the session's active LLM via `ctx.llm.stream()` when available,
 * and falls back cleanly to deterministic extraction on any error.
 */
export async function distillRange({
  ctx,
  agent,
  session,
  shadowedSeqs,
  turns,
  startTurn,
  endTurn,
  title,
  maxTokens = 4096,
  signal,
}) {
  const { transcript, facts } = extractRangeTranscript(session, shadowedSeqs);
  const rangeCn = formatTurnRangeChinese(turns, startTurn, endTurn);
  const resolvedTitle =
    (title && title.trim()) ||
    inferTitleFromFacts(facts, startTurn, endTurn);

  const llm = ctx?.get?.("llm") ?? ctx?.llm;
  const target = resolveLlmTarget(agent, session);
  if (!llm?.stream || !target) {
    return buildDeterministicFallback({
      title: resolvedTitle,
      rangeCn,
      facts,
      reason: "未检测到可用模型路由，已自动使用确定性提取",
    });
  }

  try {
    const userPrompt = [
      `请提炼以下${rangeCn}的对话区间（主题标签：${resolvedTitle}）：`,
      "",
      "--- 对话与工具记录开始 ---",
      transcript,
      "--- 对话与工具记录结束 ---",
    ].join("\n");

    const options = {
      provider: target.provider,
      model: target.model,
      messages: [
        {
          role: "system",
          content: [{ type: "text", text: DISTILL_SYSTEM_PROMPT }],
        },
        {
          role: "user",
          content: [{ type: "text", text: userPrompt }],
        },
      ],
      maxTokens,
      sessionId: session.id,
      purpose: "compaction",
      ...(signal ? { signal } : {}),
    };

    const rawText = await collectStreamText(llm.stream(options));
    const cleaned = stripOuterFence(rawText).trim();
    if (!cleaned) {
      throw new Error("模型返回了空提炼结果");
    }

    const parsed = parseFoldMarkdown(cleaned);
    if (!parsed.summary.trim()) {
      throw new Error("模型输出缺少精华段落");
    }

    const details =
      parsed.details.trim() ||
      buildDeterministicDetails(facts, rangeCn);

    return {
      title: resolvedTitle,
      summary: parsed.summary.trim(),
      details,
      generatedBy: "llm",
      provider: target.provider,
      model: target.model,
    };
  } catch (err) {
    if (signal?.aborted) throw err;
    return buildDeterministicFallback({
      title: resolvedTitle,
      rangeCn,
      facts,
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}

function resolveLlmTarget(agent, session) {
  const latest = session?.requestHeader?.()?.config;
  if (latest?.provider && latest?.model) {
    return { provider: latest.provider, model: latest.model };
  }
  if (agent?.options?.provider && agent?.options?.model) {
    return { provider: agent.options.provider, model: agent.options.model };
  }
  return null;
}

async function collectStreamText(iterable) {
  let out = "";
  for await (const chunk of iterable) {
    if (!chunk || typeof chunk !== "object") continue;
    if (chunk.type === "text-delta" && typeof chunk.text === "string") {
      out += chunk.text;
    } else if (chunk.type === "text" && typeof chunk.text === "string") {
      out += chunk.text;
    } else if (chunk.type === "error" || chunk.type === "aborted") {
      const msg = chunk.failure?.message ?? chunk.error?.message ?? "LLM stream error";
      throw new Error(msg);
    }
  }
  return out;
}

function stripOuterFence(text) {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return match ? match[1] : trimmed;
}

function inferTitleFromFacts(facts, startTurn, endTurn) {
  const firstPrompt = facts.userHighlights?.[0] ?? "";
  if (firstPrompt) {
    return firstPrompt.slice(0, 24).replace(/[\r\n]+/g, " ").trim();
  }
  return `第${startTurn}-${endTurn}轮验证折出`;
}

function buildDeterministicFallback({ title, rangeCn, facts, reason }) {
  const summaryLines = [
    `- **范围**：${rangeCn}（${title}）`,
  ];
  if (facts.userHighlights.length > 0) {
    summaryLines.push(`- **讨论起点**：${facts.userHighlights[0]}`);
  }
  if (facts.assistantHighlights.length > 0) {
    summaryLines.push(
      `- **收尾结论摘录**：${facts.assistantHighlights[facts.assistantHighlights.length - 1]}`
    );
  }
  if (facts.errors.length > 0) {
    summaryLines.push(`- **遇到异常**：${facts.errors[0]}`);
  }
  summaryLines.push(`- _（说明：本次采用确定性提炼，原因：${reason}；请按需手动润色）_`);

  return {
    title,
    summary: summaryLines.join("\n"),
    details: buildDeterministicDetails(facts, rangeCn),
    generatedBy: "deterministic",
  };
}

function buildDeterministicDetails(facts, rangeCn) {
  const lines = [`### 区间事实清单（${rangeCn}）`, ""];

  if (facts.userHighlights.length > 0) {
    lines.push("#### 用户核心提问");
    for (const u of facts.userHighlights) lines.push(`- ${u}`);
    lines.push("");
  }

  if (facts.assistantHighlights.length > 0) {
    lines.push("#### 模型关键回复摘录");
    for (const a of facts.assistantHighlights) lines.push(`- ${a}`);
    lines.push("");
  }

  if (facts.toolsUsed.length > 0) {
    lines.push(`#### 工具调用统计`);
    lines.push(`- ${facts.toolsUsed.join("、")}`);
    lines.push("");
  }

  if (facts.filesTouched.length > 0) {
    lines.push("#### 涉及文件/路径");
    for (const f of facts.filesTouched) lines.push(`- \`${f}\``);
    lines.push("");
  }

  if (facts.errors.length > 0) {
    lines.push("#### 工具报错记录");
    for (const e of facts.errors) lines.push(`- ${e}`);
    lines.push("");
  }

  return lines.join("\n").trim();
}
