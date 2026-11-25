import { PLUGIN_ID } from "../shared/constants.js";
import { formatTurnRangeChinese, normalizeTurns } from "../shared/markdown.js";

/**
 * Parse `/fold` arguments:
 *   `/fold`                       -> from latest mark to last turn
 *   `/fold 18-32 某股龙虎榜验证`    -> explicit range + title
 *   `/fold 2,4-5,8 多段验证`       -> non-contiguous turns/ranges + title
 *   `/fold last 10 支线验证`       -> last N turns + title
 *   `/fold 18-32`                 -> explicit range, auto title
 */
export function parseFoldCommandArgs(rawInput, { turnCount, marks = [] }) {
  const input = String(rawInput ?? "").trim();

  if (!input) {
    const latestMark = marks.length > 0 ? marks[marks.length - 1] : null;
    if (!latestMark) {
      throw new Error(
        "请指定轮次（如 `/fold 5-12 某股验证`、`/fold 2,4-5 标题` 或 `/fold last 8`），或先用 `/mark 标题` 打起点标记"
      );
    }
    if (latestMark.turn > turnCount) {
      throw new Error(`标记起点在第 ${latestMark.turn} 轮，但目前只到第 ${turnCount} 轮，尚无可折出内容`);
    }
    return {
      turns: normalizeTurns(undefined, latestMark.turn, turnCount),
      startTurn: latestMark.turn,
      endTurn: turnCount,
      title: latestMark.label || "",
    };
  }

  const lastMatch = input.match(/^last\s+(\d+)(?:\s+([\s\S]+))?$/i);
  if (lastMatch) {
    const count = Number(lastMatch[1]);
    if (!Number.isInteger(count) || count < 1) {
      throw new Error("`last N` 中的 N 必须是正整数");
    }
    const endTurn = turnCount;
    const startTurn = Math.max(1, endTurn - count + 1);
    return {
      turns: normalizeTurns(undefined, startTurn, endTurn),
      startTurn,
      endTurn,
      title: (lastMatch[2] ?? "").trim(),
    };
  }

  // Match comma-separated numbers/ranges: e.g. `2,4-5,8 标题` or `18-32 标题` or `5 标题`
  const multiMatch = input.match(/^(\d+(?:\s*[-–~:]\s*\d+)?(?:\s*[,，]\s*\d+(?:\s*[-–~:]\s*\d+)?)*)(?:\s+([\s\S]+))?$/);
  if (multiMatch) {
    const spec = multiMatch[1];
    const title = (multiMatch[2] ?? "").trim();
    const turns = [];
    for (const part of spec.split(/[,，]/)) {
      const trimmed = part.trim();
      const range = trimmed.match(/^(\d+)\s*[-–~:]\s*(\d+)$/);
      if (range) {
        const s = Number(range[1]);
        const e = Number(range[2]);
        for (let t = Math.min(s, e); t <= Math.max(s, e); t++) turns.push(t);
      } else if (/^\d+$/.test(trimmed)) {
        turns.push(Number(trimmed));
      }
    }
    const sorted = normalizeTurns(turns);
    if (sorted.length > 0) {
      return {
        turns: sorted,
        startTurn: sorted[0],
        endTurn: sorted[sorted.length - 1],
        title,
      };
    }
  }

  // Fallback: treat input as title using latest mark
  const latestMark = marks.length > 0 ? marks[marks.length - 1] : null;
  if (latestMark && latestMark.turn <= turnCount) {
    return {
      turns: normalizeTurns(undefined, latestMark.turn, turnCount),
      startTurn: latestMark.turn,
      endTurn: turnCount,
      title: input,
    };
  }

  throw new Error("用法：`/fold <起-止>`、`/fold 2,4-5,8 [标题]`、`/fold last <N> [标题]`，或先 `/mark` 再 `/fold`");
}

/**
 * Register slash commands on `ctx.commands`.
 */
export function registerFoldCommands(ctx, service) {
  if (!ctx.commands || typeof ctx.commands.register !== "function") return;

  const commands = [
    {
      definitionId: `${PLUGIN_ID}:folds`,
      name: "folds",
      description: "查看当前会话各轮 Token 分布与已折出档案",
      handler: async (invocation) => {
        try {
          const snap = await service.inspect(invocation.agent.session.id, {
            agent: invocation.agent,
          });
          const lines = [
            `当前模型活跃上下文：约 **${snap.totalSurfaceTokens.toLocaleString("en-US")} tokens**（共 ${snap.turnCount} 轮，已折出 ${snap.folds.length} 段）`,
            "",
          ];
          if (snap.turns.length > 0) {
            lines.push("轮次分布（* 标出高消耗验证轮）：");
            for (const t of snap.turns.slice(-25)) {
              const tag =
                t.status === "folded"
                  ? `[已折出:${t.foldTitle ?? "已压缩"}]`
                  : `${t.activeTokens} tok${t.activeTokens >= 6000 ? " *" : ""}`;
              const tools = t.toolCallCount > 0 ? ` (${t.toolCallCount}次工具)` : "";
              const mark = t.markLabel ? ` [起点:${t.markLabel}]` : "";
              lines.push(`- T${t.turn} | ${tag}${tools}${mark} | ${t.promptPreview || "(无用户输入)"}`);
            }
          }
          if (snap.folds.length > 0) {
            lines.push("", "已折出档案：");
            for (const f of snap.folds) {
              lines.push(
                `- [${f.foldId}] ${f.title}（T${f.startTurn}–T${f.endTurn}，省 ${f.savedTokens} tok）-> \`${f.relativePath}\``
              );
            }
          }
          if (snap.drafts.length > 0) {
            lines.push("", "待确认草稿（可用 `/fold-apply` 应用）：");
            for (const d of snap.drafts) {
              lines.push(`- [${d.foldId}] ${d.title}（T${d.startTurn}–T${d.endTurn}）-> \`${d.relativePath}\``);
            }
          }
          return { kind: "success", text: lines.join("\n") };
        } catch (err) {
          return { kind: "error", text: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      definitionId: `${PLUGIN_ID}:mark`,
      name: "mark",
      description: "打一个折出起点标记（如 /mark 某股龙虎榜验证），验完直接 /fold",
      handler: async (invocation) => {
        try {
          const label = invocation.rawInput.trim();
          const mark = await service.addMark(invocation.agent.session.id, {
            agent: invocation.agent,
            label,
          });
          return {
            kind: "success",
            text: `已打起点标记：**${mark.label}**（从第 ${mark.turn} 轮开始）。验证结束后输入 \`/fold\` 即可把本段折出为可编辑文档。`,
          };
        } catch (err) {
          return { kind: "error", text: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      definitionId: `${PLUGIN_ID}:fold`,
      name: "fold",
      description: "将指定轮次区间提炼为双层可编辑 Markdown 预览（/fold 18-32 标题 或 /fold last 8）",
      handler: async (invocation) => {
        try {
          const sessionId = invocation.agent.session.id;
          const snap = await service.inspect(sessionId, { agent: invocation.agent });
          const parsed = parseFoldCommandArgs(invocation.rawInput, snap);
          const result = await service.prepareFold(sessionId, {
            agent: invocation.agent,
            turns: parsed.turns,
            startTurn: parsed.startTurn,
            endTurn: parsed.endTurn,
            title: parsed.title,
            signal: invocation.signal,
          });
          const rangeCn = formatTurnRangeChinese(parsed.turns, parsed.startTurn, parsed.endTurn);
          return {
            kind: "success",
            text: [
              `已生成可编辑折出草稿：**${result.title}**（${rangeCn}）`,
              `- 档案文件：\`${result.relativePath}\``,
              `- 预计减负：${result.originalTokens} → ${result.foldedTokens} tokens（约省 **${result.savedTokens} tokens**）`,
              "",
              "你可以先打开文件审阅/修改「注入主线的精华」，确认满意后运行 `/fold-apply`（或在右侧「上下文折出」面板点击「确认折出替换」）。",
            ].join("\n"),
          };
        } catch (err) {
          return { kind: "error", text: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      definitionId: `${PLUGIN_ID}:fold-apply`,
      name: "fold-apply",
      description: "确认把预览草稿替换进模型上下文（可带 foldId，默认最新草稿）",
      handler: async (invocation) => {
        try {
          const foldId = invocation.rawInput.trim() || undefined;
          const res = await service.applyFold(invocation.agent.session.id, {
            agent: invocation.agent,
            foldId,
            sourceCommandId: invocation.commandId,
          });
          return {
            kind: "success",
            text: `已将第 ${res.fold.startTurn}–${res.fold.endTurn} 轮折出为「${res.fold.title}」，节省约 **${res.commit.savedTokens} tokens**。原始聊天记录仍保留在屏幕上；后续编辑 \`${res.fold.relativePath}\` 后可用 \`/fold-sync ${res.fold.foldId}\` 原地同步。`,
            sourceEventSeq: res.commit.summarySeq,
          };
        } catch (err) {
          return { kind: "error", text: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      definitionId: `${PLUGIN_ID}:fold-sync`,
      name: "fold-sync",
      description: "把修改后的折出 Markdown 文件原地同步回模型上下文（不刷屏）",
      handler: async (invocation) => {
        try {
          const foldId = invocation.rawInput.trim() || undefined;
          const res = await service.syncFold(invocation.agent.session.id, {
            agent: invocation.agent,
            foldId,
          });
          return {
            kind: "success",
            text: `已同步最新修改到模型上下文：**${res.fold.title}**（第 ${res.fold.syncCount} 次同步，当前占用约 ${res.resync.foldedTokens} tokens）。`,
          };
        } catch (err) {
          return { kind: "error", text: err instanceof Error ? err.message : String(err) };
        }
      },
    },
  ];

  for (const cmd of commands) {
    ctx.effect(() => ctx.commands.register(cmd), `context-fold command /${cmd.name}`);
  }
}
