import {
  FOLD_CLOSE_TAG,
  FOLD_OPEN_TAG,
  SECTION_DETAIL_HEADING,
  SECTION_SUMMARY_HEADING,
} from "./constants.js";

/**
 * Normalize a list of turn numbers into a sorted, deduplicated array of positive integers.
 */
export function normalizeTurns(turns, fallbackStart, fallbackEnd) {
  const set = new Set();
  if (Array.isArray(turns) && turns.length > 0) {
    for (const t of turns) {
      const n = Number(t);
      if (Number.isInteger(n) && n >= 1) set.add(n);
    }
  } else if (Number.isInteger(Number(fallbackStart)) && Number.isInteger(Number(fallbackEnd))) {
    const s = Number(fallbackStart);
    const e = Number(fallbackEnd);
    for (let t = Math.min(s, e); t <= Math.max(s, e); t++) {
      if (t >= 1) set.add(t);
    }
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * Group sorted turn numbers into contiguous segments:
 *   [2, 4, 5, 8] -> [{ startTurn: 2, endTurn: 2 }, { startTurn: 4, endTurn: 5 }, { startTurn: 8, endTurn: 8 }]
 */
export function groupContiguousTurns(turns) {
  const sorted = normalizeTurns(turns);
  if (sorted.length === 0) return [];
  const groups = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i];
    } else {
      groups.push({ startTurn: start, endTurn: prev });
      start = sorted[i];
      prev = sorted[i];
    }
  }
  groups.push({ startTurn: start, endTurn: prev });
  return groups;
}

/**
 * Format turn numbers cleanly for human display, e.g. [2, 4, 5] -> "T2, T4–T5" or "第 2、4–5 轮".
 */
export function formatTurnLabel(turns, { prefix = "T", sep = ", ", fallbackStart, fallbackEnd } = {}) {
  const groups = groupContiguousTurns(normalizeTurns(turns, fallbackStart, fallbackEnd));
  if (groups.length === 0) return "";
  return groups
    .map((g) =>
      g.startTurn === g.endTurn
        ? `${prefix}${g.startTurn}`
        : `${prefix}${g.startTurn}–${prefix}${g.endTurn}`
    )
    .join(sep);
}

export function formatTurnRangeChinese(turns, fallbackStart, fallbackEnd) {
  const groups = groupContiguousTurns(normalizeTurns(turns, fallbackStart, fallbackEnd));
  if (groups.length === 0) return "未知轮次";
  const parts = groups.map((g) =>
    g.startTurn === g.endTurn ? `${g.startTurn}` : `${g.startTurn}–${g.endTurn}`
  );
  return `第 ${parts.join("、")} 轮`;
}

/**
 * Serialize a dual-layer fold Markdown document.
 *
 * Structure:
 *   ---
 *   foldId: ...
 *   title: ...
 *   ...
 *   ---
 *
 *   # <title>
 *
 *   ## 注入主线的精华
 *   <concise summary injected into main context>
 *
 *   ## 详细复盘与数据
 *   <detailed archive kept on disk, read on demand>
 */
export function serializeFoldMarkdown(doc) {
  const turns = normalizeTurns(doc.turns, doc.startTurn, doc.endTurn);
  const fmLines = [
    "---",
    `foldId: ${yamlScalar(doc.foldId)}`,
    `title: ${yamlScalar(doc.title)}`,
    `sessionId: ${yamlScalar(doc.sessionId)}`,
    `turns: ${yamlScalar(turns.join(","))}`,
    `startTurn: ${Number(doc.startTurn ?? turns[0] ?? 1)}`,
    `endTurn: ${Number(doc.endTurn ?? turns[turns.length - 1] ?? 1)}`,
    `startSeq: ${Number(doc.startSeq ?? 0)}`,
    `endSeq: ${Number(doc.endSeq ?? 0)}`,
    `checkpointSeq: ${doc.checkpointSeq ?? "null"}`,
    `originalTokens: ${Number(doc.originalTokens ?? 0)}`,
    `foldedTokens: ${Number(doc.foldedTokens ?? 0)}`,
    `generatedBy: ${yamlScalar(doc.generatedBy ?? "llm")}`,
    `createdAt: ${yamlScalar(doc.createdAt ?? new Date().toISOString())}`,
    `updatedAt: ${yamlScalar(doc.updatedAt ?? new Date().toISOString())}`,
    "---",
  ];

  const summary = normalizeBody(doc.summary);
  const details = normalizeBody(doc.details);

  return [
    fmLines.join("\n"),
    "",
    `# ${doc.title}`,
    "",
    SECTION_SUMMARY_HEADING,
    "",
    summary,
    "",
    SECTION_DETAIL_HEADING,
    "",
    details,
    "",
  ].join("\n");
}

/**
 * Parse a dual-layer fold Markdown document back into metadata + summary + details.
 * Resilient to user edits: if headings are tweaked slightly, falls back cleanly.
 */
export function parseFoldMarkdown(rawText) {
  const text = String(rawText ?? "").replace(/\r\n/g, "\n");
  const meta = {};
  let body = text;

  const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fmMatch) {
    body = text.slice(fmMatch[0].length);
    for (const line of fmMatch[1].split("\n")) {
      const idx = line.indexOf(":");
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      const rawVal = line.slice(idx + 1).trim();
      meta[key] = parseYamlScalar(rawVal);
    }
  }

  const titleMatch = body.match(/^#\s+(.+)$/m);
  const title = (titleMatch ? titleMatch[1].trim() : "") || String(meta.title ?? "未命名折出");

  const summaryIdx = findHeadingIndex(body, SECTION_SUMMARY_HEADING);
  const detailIdx = findHeadingIndex(body, SECTION_DETAIL_HEADING);

  let summary = "";
  let details = "";

  if (summaryIdx !== -1 && detailIdx !== -1 && detailIdx > summaryIdx) {
    const afterSummary = skipHeadingLine(body, summaryIdx);
    summary = body.slice(afterSummary, detailIdx).trim();
    const afterDetail = skipHeadingLine(body, detailIdx);
    details = body.slice(afterDetail).trim();
  } else if (summaryIdx !== -1) {
    const afterSummary = skipHeadingLine(body, summaryIdx);
    summary = body.slice(afterSummary).trim();
  } else if (detailIdx !== -1) {
    summary = body.slice(0, detailIdx).replace(/^#\s+.+$/m, "").trim();
    const afterDetail = skipHeadingLine(body, detailIdx);
    details = body.slice(afterDetail).trim();
  } else {
    summary = body.replace(/^#\s+.+$/m, "").trim();
  }

  return {
    meta,
    title,
    summary,
    details,
  };
}

/**
 * Build the exact text injected into the model-visible surface checkpoint node.
 * Only includes the concise summary + archive file pointer so the model can read
 * the full verification log on demand without bloating main-thread context.
 */
export function buildCheckpointText({
  foldId,
  title,
  turns,
  startTurn,
  endTurn,
  filePath,
  summary,
  originalTokens,
}) {
  const cleanSummary = normalizeBody(summary);
  const rangeCn = formatTurnRangeChinese(turns, startTurn, endTurn);
  const rangeCompact = formatTurnLabel(turns, { prefix: "", sep: ",", fallbackStart: startTurn, fallbackEnd: endTurn });
  const tokenNote =
    originalTokens > 0 ? `（原区间约 ${originalTokens.toLocaleString("en-US")} tokens）` : "";

  return [
    `[上下文局部折出 · ${rangeCn}已沉淀为外部文档${tokenNote}]`,
    `请将下方精华视为该区间已验证的背景共识继续推进；如后续需要核查原始数据、具体推演过程或反例细节，可直接读取完整档案文件：\`${filePath}\``,
    "",
    `${FOLD_OPEN_TAG}`,
    `foldId: ${foldId}`,
    `title: ${title}`,
    `range: turns ${rangeCompact}`,
    `archive: ${filePath}`,
    "",
    cleanSummary,
    `${FOLD_CLOSE_TAG}`,
  ].join("\n");
}

/**
 * Tiny cross-reference stub placed at earlier non-contiguous segments when a multi-segment
 * fold consolidates its main summary at the latest selected segment.
 */
export function buildSegmentStubText({ foldId, title, startTurn, endTurn, filePath }) {
  const segLabel = startTurn === endTurn ? `第 ${startTurn} 轮` : `第 ${startTurn}–${endTurn} 轮`;
  return `[上下文局部折出 · ${segLabel}已合并归档至「${title}」（foldId: ${foldId}），精华摘要见下方合并节点，完整档案：\`${filePath}\`]`;
}

/**
 * Rough token heuristic (works cleanly for mixed Chinese + English text).
 */
export function estimateTokens(text) {
  if (!text) return 0;
  let cjk = 0;
  let other = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x3000 && code <= 0x303f) ||
      (code >= 0xff00 && code <= 0xffef)
    ) {
      cjk += 1;
    } else {
      other += 1;
    }
  }
  return Math.max(1, Math.ceil(cjk * 1.15 + other / 3.8));
}

function normalizeBody(str) {
  return String(str ?? "").replace(/\r\n/g, "\n").trim();
}

function findHeadingIndex(body, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`^${escaped}\\s*$`, "m"));
  return match && typeof match.index === "number" ? match.index : -1;
}

function skipHeadingLine(body, index) {
  const nl = body.indexOf("\n", index);
  return nl === -1 ? body.length : nl + 1;
}

function yamlScalar(val) {
  const s = String(val ?? "");
  if (s === "" || /[:#\n\r"'`{}\[\],&*?|>!%@\\]/.test(s) || /^\s|\s$/.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}

function parseYamlScalar(raw) {
  if (raw === "null" || raw === "~" || raw === "") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    try {
      return raw.startsWith('"') ? JSON.parse(raw) : raw.slice(1, -1);
    } catch {
      return raw.slice(1, -1);
    }
  }
  return raw;
}
