// src/shared/constants.js
var PLUGIN_ID = "dsh-context-fold";
var PLUGIN_NAME = "context-fold";
var API_PREFIX = "/api/context-fold";
var DEFAULT_FOLD_DIR_NAME = ".dsh-folds";
var SECTION_SUMMARY_HEADING = "## \u6CE8\u5165\u4E3B\u7EBF\u7684\u7CBE\u534E";
var SECTION_DETAIL_HEADING = "## \u8BE6\u7EC6\u590D\u76D8\u4E0E\u6570\u636E";
var FOLD_OPEN_TAG = "<context-fold-checkpoint>";
var FOLD_CLOSE_TAG = "</context-fold-checkpoint>";

// src/shared/markdown.js
function normalizeTurns(turns, fallbackStart, fallbackEnd) {
  const set = /* @__PURE__ */ new Set();
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
function groupContiguousTurns(turns) {
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
function formatTurnLabel(turns, { prefix = "T", sep: sep2 = ", ", fallbackStart, fallbackEnd } = {}) {
  const groups = groupContiguousTurns(normalizeTurns(turns, fallbackStart, fallbackEnd));
  if (groups.length === 0) return "";
  return groups.map(
    (g) => g.startTurn === g.endTurn ? `${prefix}${g.startTurn}` : `${prefix}${g.startTurn}\u2013${prefix}${g.endTurn}`
  ).join(sep2);
}
function formatTurnRangeChinese(turns, fallbackStart, fallbackEnd) {
  const groups = groupContiguousTurns(normalizeTurns(turns, fallbackStart, fallbackEnd));
  if (groups.length === 0) return "\u672A\u77E5\u8F6E\u6B21";
  const parts = groups.map(
    (g) => g.startTurn === g.endTurn ? `${g.startTurn}` : `${g.startTurn}\u2013${g.endTurn}`
  );
  return `\u7B2C ${parts.join("\u3001")} \u8F6E`;
}
function serializeFoldMarkdown(doc) {
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
    `createdAt: ${yamlScalar(doc.createdAt ?? (/* @__PURE__ */ new Date()).toISOString())}`,
    `updatedAt: ${yamlScalar(doc.updatedAt ?? (/* @__PURE__ */ new Date()).toISOString())}`,
    "---"
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
    ""
  ].join("\n");
}
function parseFoldMarkdown(rawText) {
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
  const title = (titleMatch ? titleMatch[1].trim() : "") || String(meta.title ?? "\u672A\u547D\u540D\u6298\u51FA");
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
    details
  };
}
function buildCheckpointText({
  foldId,
  title,
  turns,
  startTurn,
  endTurn,
  filePath,
  summary,
  originalTokens
}) {
  const cleanSummary = normalizeBody(summary);
  const rangeCn = formatTurnRangeChinese(turns, startTurn, endTurn);
  const rangeCompact = formatTurnLabel(turns, { prefix: "", sep: ",", fallbackStart: startTurn, fallbackEnd: endTurn });
  const tokenNote = originalTokens > 0 ? `\uFF08\u539F\u533A\u95F4\u7EA6 ${originalTokens.toLocaleString("en-US")} tokens\uFF09` : "";
  return [
    `[\u4E0A\u4E0B\u6587\u5C40\u90E8\u6298\u51FA \xB7 ${rangeCn}\u5DF2\u6C89\u6DC0\u4E3A\u5916\u90E8\u6587\u6863${tokenNote}]`,
    `\u8BF7\u5C06\u4E0B\u65B9\u7CBE\u534E\u89C6\u4E3A\u8BE5\u533A\u95F4\u5DF2\u9A8C\u8BC1\u7684\u80CC\u666F\u5171\u8BC6\u7EE7\u7EED\u63A8\u8FDB\uFF1B\u5982\u540E\u7EED\u9700\u8981\u6838\u67E5\u539F\u59CB\u6570\u636E\u3001\u5177\u4F53\u63A8\u6F14\u8FC7\u7A0B\u6216\u53CD\u4F8B\u7EC6\u8282\uFF0C\u53EF\u76F4\u63A5\u8BFB\u53D6\u5B8C\u6574\u6863\u6848\u6587\u4EF6\uFF1A\`${filePath}\``,
    "",
    `${FOLD_OPEN_TAG}`,
    `foldId: ${foldId}`,
    `title: ${title}`,
    `range: turns ${rangeCompact}`,
    `archive: ${filePath}`,
    "",
    cleanSummary,
    `${FOLD_CLOSE_TAG}`
  ].join("\n");
}
function buildSegmentStubText({ foldId, title, startTurn, endTurn, filePath }) {
  const segLabel = startTurn === endTurn ? `\u7B2C ${startTurn} \u8F6E` : `\u7B2C ${startTurn}\u2013${endTurn} \u8F6E`;
  return `[\u4E0A\u4E0B\u6587\u5C40\u90E8\u6298\u51FA \xB7 ${segLabel}\u5DF2\u5408\u5E76\u5F52\u6863\u81F3\u300C${title}\u300D\uFF08foldId: ${foldId}\uFF09\uFF0C\u7CBE\u534E\u6458\u8981\u89C1\u4E0B\u65B9\u5408\u5E76\u8282\u70B9\uFF0C\u5B8C\u6574\u6863\u6848\uFF1A\`${filePath}\`]`;
}
function estimateTokens(text) {
  if (!text) return 0;
  let cjk = 0;
  let other = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 19968 && code <= 40959 || code >= 13312 && code <= 19903 || code >= 12288 && code <= 12351 || code >= 65280 && code <= 65519) {
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
  if (raw.startsWith('"') && raw.endsWith('"') || raw.startsWith("'") && raw.endsWith("'")) {
    try {
      return raw.startsWith('"') ? JSON.parse(raw) : raw.slice(1, -1);
    } catch {
      return raw.slice(1, -1);
    }
  }
  return raw;
}

// src/host/commands.js
function parseFoldCommandArgs(rawInput, { turnCount, marks = [] }) {
  const input = String(rawInput ?? "").trim();
  if (!input) {
    const latestMark2 = marks.length > 0 ? marks[marks.length - 1] : null;
    if (!latestMark2) {
      throw new Error(
        "\u8BF7\u6307\u5B9A\u8F6E\u6B21\uFF08\u5982 `/fold 5-12 \u67D0\u80A1\u9A8C\u8BC1`\u3001`/fold 2,4-5 \u6807\u9898` \u6216 `/fold last 8`\uFF09\uFF0C\u6216\u5148\u7528 `/mark \u6807\u9898` \u6253\u8D77\u70B9\u6807\u8BB0"
      );
    }
    if (latestMark2.turn > turnCount) {
      throw new Error(`\u6807\u8BB0\u8D77\u70B9\u5728\u7B2C ${latestMark2.turn} \u8F6E\uFF0C\u4F46\u76EE\u524D\u53EA\u5230\u7B2C ${turnCount} \u8F6E\uFF0C\u5C1A\u65E0\u53EF\u6298\u51FA\u5185\u5BB9`);
    }
    return {
      turns: normalizeTurns(void 0, latestMark2.turn, turnCount),
      startTurn: latestMark2.turn,
      endTurn: turnCount,
      title: latestMark2.label || ""
    };
  }
  const lastMatch = input.match(/^last\s+(\d+)(?:\s+([\s\S]+))?$/i);
  if (lastMatch) {
    const count = Number(lastMatch[1]);
    if (!Number.isInteger(count) || count < 1) {
      throw new Error("`last N` \u4E2D\u7684 N \u5FC5\u987B\u662F\u6B63\u6574\u6570");
    }
    const endTurn = turnCount;
    const startTurn = Math.max(1, endTurn - count + 1);
    return {
      turns: normalizeTurns(void 0, startTurn, endTurn),
      startTurn,
      endTurn,
      title: (lastMatch[2] ?? "").trim()
    };
  }
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
        title
      };
    }
  }
  const latestMark = marks.length > 0 ? marks[marks.length - 1] : null;
  if (latestMark && latestMark.turn <= turnCount) {
    return {
      turns: normalizeTurns(void 0, latestMark.turn, turnCount),
      startTurn: latestMark.turn,
      endTurn: turnCount,
      title: input
    };
  }
  throw new Error("\u7528\u6CD5\uFF1A`/fold <\u8D77-\u6B62>`\u3001`/fold 2,4-5,8 [\u6807\u9898]`\u3001`/fold last <N> [\u6807\u9898]`\uFF0C\u6216\u5148 `/mark` \u518D `/fold`");
}
function registerFoldCommands(ctx, service) {
  if (!ctx.commands || typeof ctx.commands.register !== "function") return;
  const commands = [
    {
      definitionId: `${PLUGIN_ID}:folds`,
      name: "folds",
      description: "\u67E5\u770B\u5F53\u524D\u4F1A\u8BDD\u5404\u8F6E Token \u5206\u5E03\u4E0E\u5DF2\u6298\u51FA\u6863\u6848",
      handler: async (invocation) => {
        try {
          const snap = await service.inspect(invocation.agent.session.id, {
            agent: invocation.agent
          });
          const lines = [
            `\u5F53\u524D\u6A21\u578B\u6D3B\u8DC3\u4E0A\u4E0B\u6587\uFF1A\u7EA6 **${snap.totalSurfaceTokens.toLocaleString("en-US")} tokens**\uFF08\u5171 ${snap.turnCount} \u8F6E\uFF0C\u5DF2\u6298\u51FA ${snap.folds.length} \u6BB5\uFF09`,
            ""
          ];
          if (snap.turns.length > 0) {
            lines.push("\u8F6E\u6B21\u5206\u5E03\uFF08* \u6807\u51FA\u9AD8\u6D88\u8017\u9A8C\u8BC1\u8F6E\uFF09\uFF1A");
            for (const t of snap.turns.slice(-25)) {
              const tag = t.status === "folded" ? `[\u5DF2\u6298\u51FA:${t.foldTitle ?? "\u5DF2\u538B\u7F29"}]` : `${t.activeTokens} tok${t.activeTokens >= 6e3 ? " *" : ""}`;
              const tools = t.toolCallCount > 0 ? ` (${t.toolCallCount}\u6B21\u5DE5\u5177)` : "";
              const mark = t.markLabel ? ` [\u8D77\u70B9:${t.markLabel}]` : "";
              lines.push(`- T${t.turn} | ${tag}${tools}${mark} | ${t.promptPreview || "(\u65E0\u7528\u6237\u8F93\u5165)"}`);
            }
          }
          if (snap.folds.length > 0) {
            lines.push("", "\u5DF2\u6298\u51FA\u6863\u6848\uFF1A");
            for (const f of snap.folds) {
              lines.push(
                `- [${f.foldId}] ${f.title}\uFF08T${f.startTurn}\u2013T${f.endTurn}\uFF0C\u7701 ${f.savedTokens} tok\uFF09-> \`${f.relativePath}\``
              );
            }
          }
          if (snap.drafts.length > 0) {
            lines.push("", "\u5F85\u786E\u8BA4\u8349\u7A3F\uFF08\u53EF\u7528 `/fold-apply` \u5E94\u7528\uFF09\uFF1A");
            for (const d of snap.drafts) {
              lines.push(`- [${d.foldId}] ${d.title}\uFF08T${d.startTurn}\u2013T${d.endTurn}\uFF09-> \`${d.relativePath}\``);
            }
          }
          return { kind: "success", text: lines.join("\n") };
        } catch (err) {
          return { kind: "error", text: err instanceof Error ? err.message : String(err) };
        }
      }
    },
    {
      definitionId: `${PLUGIN_ID}:mark`,
      name: "mark",
      description: "\u6253\u4E00\u4E2A\u6298\u51FA\u8D77\u70B9\u6807\u8BB0\uFF08\u5982 /mark \u67D0\u80A1\u9F99\u864E\u699C\u9A8C\u8BC1\uFF09\uFF0C\u9A8C\u5B8C\u76F4\u63A5 /fold",
      handler: async (invocation) => {
        try {
          const label = invocation.rawInput.trim();
          const mark = await service.addMark(invocation.agent.session.id, {
            agent: invocation.agent,
            label
          });
          return {
            kind: "success",
            text: `\u5DF2\u6253\u8D77\u70B9\u6807\u8BB0\uFF1A**${mark.label}**\uFF08\u4ECE\u7B2C ${mark.turn} \u8F6E\u5F00\u59CB\uFF09\u3002\u9A8C\u8BC1\u7ED3\u675F\u540E\u8F93\u5165 \`/fold\` \u5373\u53EF\u628A\u672C\u6BB5\u6298\u51FA\u4E3A\u53EF\u7F16\u8F91\u6587\u6863\u3002`
          };
        } catch (err) {
          return { kind: "error", text: err instanceof Error ? err.message : String(err) };
        }
      }
    },
    {
      definitionId: `${PLUGIN_ID}:fold`,
      name: "fold",
      description: "\u5C06\u6307\u5B9A\u8F6E\u6B21\u533A\u95F4\u63D0\u70BC\u4E3A\u53CC\u5C42\u53EF\u7F16\u8F91 Markdown \u9884\u89C8\uFF08/fold 18-32 \u6807\u9898 \u6216 /fold last 8\uFF09",
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
            signal: invocation.signal
          });
          const rangeCn = formatTurnRangeChinese(parsed.turns, parsed.startTurn, parsed.endTurn);
          return {
            kind: "success",
            text: [
              `\u5DF2\u751F\u6210\u53EF\u7F16\u8F91\u6298\u51FA\u8349\u7A3F\uFF1A**${result.title}**\uFF08${rangeCn}\uFF09`,
              `- \u6863\u6848\u6587\u4EF6\uFF1A\`${result.relativePath}\``,
              `- \u9884\u8BA1\u51CF\u8D1F\uFF1A${result.originalTokens} \u2192 ${result.foldedTokens} tokens\uFF08\u7EA6\u7701 **${result.savedTokens} tokens**\uFF09`,
              "",
              "\u4F60\u53EF\u4EE5\u5148\u6253\u5F00\u6587\u4EF6\u5BA1\u9605/\u4FEE\u6539\u300C\u6CE8\u5165\u4E3B\u7EBF\u7684\u7CBE\u534E\u300D\uFF0C\u786E\u8BA4\u6EE1\u610F\u540E\u8FD0\u884C `/fold-apply`\uFF08\u6216\u5728\u53F3\u4FA7\u300C\u4E0A\u4E0B\u6587\u6298\u51FA\u300D\u9762\u677F\u70B9\u51FB\u300C\u786E\u8BA4\u6298\u51FA\u66FF\u6362\u300D\uFF09\u3002"
            ].join("\n")
          };
        } catch (err) {
          return { kind: "error", text: err instanceof Error ? err.message : String(err) };
        }
      }
    },
    {
      definitionId: `${PLUGIN_ID}:fold-apply`,
      name: "fold-apply",
      description: "\u786E\u8BA4\u628A\u9884\u89C8\u8349\u7A3F\u66FF\u6362\u8FDB\u6A21\u578B\u4E0A\u4E0B\u6587\uFF08\u53EF\u5E26 foldId\uFF0C\u9ED8\u8BA4\u6700\u65B0\u8349\u7A3F\uFF09",
      handler: async (invocation) => {
        try {
          const foldId = invocation.rawInput.trim() || void 0;
          const res = await service.applyFold(invocation.agent.session.id, {
            agent: invocation.agent,
            foldId,
            sourceCommandId: invocation.commandId
          });
          return {
            kind: "success",
            text: `\u5DF2\u5C06\u7B2C ${res.fold.startTurn}\u2013${res.fold.endTurn} \u8F6E\u6298\u51FA\u4E3A\u300C${res.fold.title}\u300D\uFF0C\u8282\u7701\u7EA6 **${res.commit.savedTokens} tokens**\u3002\u539F\u59CB\u804A\u5929\u8BB0\u5F55\u4ECD\u4FDD\u7559\u5728\u5C4F\u5E55\u4E0A\uFF1B\u540E\u7EED\u7F16\u8F91 \`${res.fold.relativePath}\` \u540E\u53EF\u7528 \`/fold-sync ${res.fold.foldId}\` \u539F\u5730\u540C\u6B65\u3002`,
            sourceEventSeq: res.commit.summarySeq
          };
        } catch (err) {
          return { kind: "error", text: err instanceof Error ? err.message : String(err) };
        }
      }
    },
    {
      definitionId: `${PLUGIN_ID}:fold-sync`,
      name: "fold-sync",
      description: "\u628A\u4FEE\u6539\u540E\u7684\u6298\u51FA Markdown \u6587\u4EF6\u539F\u5730\u540C\u6B65\u56DE\u6A21\u578B\u4E0A\u4E0B\u6587\uFF08\u4E0D\u5237\u5C4F\uFF09",
      handler: async (invocation) => {
        try {
          const foldId = invocation.rawInput.trim() || void 0;
          const res = await service.syncFold(invocation.agent.session.id, {
            agent: invocation.agent,
            foldId
          });
          return {
            kind: "success",
            text: `\u5DF2\u540C\u6B65\u6700\u65B0\u4FEE\u6539\u5230\u6A21\u578B\u4E0A\u4E0B\u6587\uFF1A**${res.fold.title}**\uFF08\u7B2C ${res.fold.syncCount} \u6B21\u540C\u6B65\uFF0C\u5F53\u524D\u5360\u7528\u7EA6 ${res.resync.foldedTokens} tokens\uFF09\u3002`
          };
        } catch (err) {
          return { kind: "error", text: err instanceof Error ? err.message : String(err) };
        }
      }
    }
  ];
  for (const cmd of commands) {
    ctx.effect(() => ctx.commands.register(cmd), `context-fold command /${cmd.name}`);
  }
}

// src/host/routes.js
async function readJsonBody(req, limitBytes = 2 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limitBytes) {
      throw new Error("\u8BF7\u6C42\u4F53\u8D85\u8FC7\u9650\u5236 (2MB)");
    }
    chunks.push(Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload));
}
function queryParam(req, name2) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  return url.searchParams.get(name2) ?? "";
}
function registerFoldRoutes(ctx, service) {
  if (!ctx.webServer || typeof ctx.webServer.register !== "function") return;
  const routes = [
    {
      name: "state",
      handle: async (req) => {
        if (req.method !== "GET") throw new Error("\u4EC5\u652F\u6301 GET");
        const sessionId = queryParam(req, "sessionId");
        if (!sessionId) throw new Error("\u7F3A\u5C11 sessionId \u53C2\u6570");
        return await service.inspect(sessionId);
      }
    },
    {
      name: "mark",
      handle: async (req) => {
        if (req.method !== "POST") throw new Error("\u4EC5\u652F\u6301 POST");
        const data = await readJsonBody(req);
        if (!data.sessionId) throw new Error("\u7F3A\u5C11 sessionId");
        if (data.action === "remove") {
          return await service.removeMark(data.sessionId, { markId: data.markId });
        }
        return await service.addMark(data.sessionId, {
          label: data.label,
          turn: data.turn
        });
      }
    },
    {
      name: "prepare",
      handle: async (req) => {
        if (req.method !== "POST") throw new Error("\u4EC5\u652F\u6301 POST");
        const data = await readJsonBody(req);
        if (!data.sessionId) throw new Error("\u7F3A\u5C11 sessionId");
        return await service.prepareFold(data.sessionId, {
          turns: data.turns,
          startTurn: data.startTurn,
          endTurn: data.endTurn,
          title: data.title
        });
      }
    },
    {
      name: "apply",
      handle: async (req) => {
        if (req.method !== "POST") throw new Error("\u4EC5\u652F\u6301 POST");
        const data = await readJsonBody(req);
        if (!data.sessionId) throw new Error("\u7F3A\u5C11 sessionId");
        return await service.applyFold(data.sessionId, {
          foldId: data.foldId,
          title: data.title,
          summary: data.summary,
          details: data.details
        });
      }
    },
    {
      name: "discard",
      handle: async (req) => {
        if (req.method !== "POST") throw new Error("\u4EC5\u652F\u6301 POST");
        const data = await readJsonBody(req);
        if (!data.sessionId || !data.foldId) throw new Error("\u7F3A\u5C11 sessionId \u6216 foldId");
        return await service.discardDraft(data.sessionId, { foldId: data.foldId });
      }
    },
    {
      name: "document",
      handle: async (req) => {
        if (req.method !== "GET") throw new Error("\u4EC5\u652F\u6301 GET");
        const sessionId = queryParam(req, "sessionId");
        const foldId = queryParam(req, "foldId");
        if (!sessionId || !foldId) throw new Error("\u7F3A\u5C11 sessionId \u6216 foldId");
        return await service.readDocument(sessionId, { foldId });
      }
    },
    {
      name: "save-file",
      handle: async (req) => {
        if (req.method !== "POST") throw new Error("\u4EC5\u652F\u6301 POST");
        const data = await readJsonBody(req);
        if (!data.sessionId || !data.foldId) throw new Error("\u7F3A\u5C11 sessionId \u6216 foldId");
        return await service.saveDocumentOnly(data.sessionId, {
          foldId: data.foldId,
          title: data.title,
          summary: data.summary,
          details: data.details
        });
      }
    },
    {
      name: "sync",
      handle: async (req) => {
        if (req.method !== "POST") throw new Error("\u4EC5\u652F\u6301 POST");
        const data = await readJsonBody(req);
        if (!data.sessionId) throw new Error("\u7F3A\u5C11 sessionId");
        return await service.syncFold(data.sessionId, {
          foldId: data.foldId,
          title: data.title,
          summary: data.summary,
          details: data.details
        });
      }
    }
  ];
  for (const route of routes) {
    ctx.effect(
      () => ctx.webServer.register({
        kind: "exact",
        path: `${API_PREFIX}/${route.name}`,
        handler: async (req, res) => {
          try {
            const payload = await route.handle(req);
            sendJson(res, 200, payload);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            sendJson(res, 400, { error: message });
          }
        }
      }),
      `context-fold route ${API_PREFIX}/${route.name}`
    );
  }
}

// src/host/service.js
import { randomUUID as randomUUID3 } from "node:crypto";

// src/host/committer.js
import { randomUUID } from "node:crypto";

// src/host/inspector.js
function readSessionEvents(session) {
  if (Array.isArray(session.log)) return session.log;
  const len = typeof session.logLength === "number" ? session.logLength : 0;
  const out = [];
  for (let i = 0; i < len; i++) {
    const ev = session.eventAt?.(i);
    if (ev !== void 0) out.push(ev);
  }
  return out;
}
function extractTextFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const block of content) {
    if (typeof block === "string") {
      parts.push(block);
    } else if (block && typeof block === "object" && block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.join("\n");
}
function isSyntheticUserText(text) {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith("<system-reminder>")) return true;
  if (trimmed.startsWith("Current runtime context.")) return true;
  if (trimmed.startsWith("Time sampled while preparing turn")) return true;
  if (trimmed.startsWith("[\u4E0A\u4E0B\u6587\u5C40\u90E8\u6298\u51FA")) return true;
  if (trimmed.startsWith("This is an automatically generated checkpoint")) return true;
  return false;
}
function measureSurfaceNodeTokens(session, tokenMeter) {
  const tokenBySeq = /* @__PURE__ */ new Map();
  let totalTokens = 0;
  if (tokenMeter && typeof tokenMeter.measure === "function") {
    try {
      const m = tokenMeter.measure(session);
      if (m && Array.isArray(m.nodes)) {
        for (const node of m.nodes) {
          const t = typeof node.tokens === "number" ? node.tokens : node.heuristicTokens ?? 0;
          tokenBySeq.set(node.seq, t);
          totalTokens += t;
        }
        return { tokenBySeq, totalTokens: typeof m.totalTokens === "number" ? m.totalTokens : totalTokens };
      }
    } catch {
    }
  }
  const events = readSessionEvents(session);
  const surfaceNodes = session.surface?.nodes ?? [];
  for (const seq of surfaceNodes) {
    const ev = events[seq];
    const t = estimateEventTokens(ev);
    tokenBySeq.set(seq, t);
    totalTokens += t;
  }
  return { tokenBySeq, totalTokens };
}
function estimateEventTokens(ev) {
  if (!ev || !ev.data) return 0;
  if (ev.type === "user/message") {
    return estimateTokens(extractTextFromContent(ev.data.content));
  }
  if (ev.type === "assistant/message" || ev.type === "system/message" || ev.type === "developer/message") {
    const content = ev.data.message?.content;
    if (!Array.isArray(content)) return 0;
    let total = 0;
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      if (block.type === "text" && typeof block.text === "string") {
        total += estimateTokens(block.text);
      } else if (block.type === "tool-call") {
        total += estimateTokens(JSON.stringify(block.arguments ?? {})) + 20;
      } else if (block.type === "reasoning" && typeof block.text === "string") {
        total += Math.ceil(estimateTokens(block.text) * 0.1);
      }
    }
    return total;
  }
  if (ev.type === "tool/result") {
    const content = ev.data.message?.content;
    if (typeof content === "string") return estimateTokens(content);
    if (Array.isArray(content)) {
      let total = 0;
      for (const b of content) {
        if (b?.type === "text" && typeof b.text === "string") total += estimateTokens(b.text);
        else if (b?.type === "image") total += 1e3;
        else total += estimateTokens(JSON.stringify(b ?? ""));
      }
      return total;
    }
    return estimateTokens(JSON.stringify(content ?? ""));
  }
  return 0;
}
function computeToolPairingBalance(session) {
  const events = readSessionEvents(session);
  const nodes = session.surface?.nodes ?? [];
  const cutBalanced = [true];
  const indexBySeq = /* @__PURE__ */ new Map();
  let inFlight = 0;
  for (let i = 0; i < nodes.length; i++) {
    const seq = nodes[i];
    indexBySeq.set(seq, i);
    const ev = events[seq];
    if (ev?.type === "assistant/message" && Array.isArray(ev.data?.message?.content)) {
      inFlight += ev.data.message.content.filter((b) => b?.type === "tool-call").length;
    } else if (ev?.type === "tool/result") {
      inFlight -= 1;
    }
    cutBalanced.push(inFlight === 0);
  }
  return {
    nodes,
    indexBySeq,
    balancedBefore(seq) {
      const idx = indexBySeq.get(seq);
      if (idx === void 0) return false;
      return cutBalanced[idx] === true;
    },
    balancedAfter(seq) {
      const idx = indexBySeq.get(seq);
      if (idx === void 0) return false;
      return cutBalanced[idx + 1] === true;
    }
  };
}
function inspectSessionTurns(session, { tokenMeter = null, folds = [], marks = [] } = {}) {
  const events = readSessionEvents(session);
  const surfaceNodes = [...session.surface?.nodes ?? []];
  const surfaceSet = new Set(surfaceNodes);
  const { tokenBySeq, totalTokens } = measureSurfaceNodeTokens(session, tokenMeter);
  const foldByTurn = /* @__PURE__ */ new Map();
  for (const fold of folds) {
    const foldTurns = normalizeTurns(fold.turns, fold.startTurn, fold.endTurn);
    for (const t of foldTurns) {
      foldByTurn.set(t, fold);
    }
  }
  const markByTurn = /* @__PURE__ */ new Map();
  for (const m of marks) {
    markByTurn.set(m.turn, m);
  }
  const turns = [];
  let current = null;
  for (const ev of events) {
    if (!ev) continue;
    if (ev.type === "turn/start") {
      if (current) turns.push(current);
      const turnNumber = turns.length + 1;
      current = {
        turn: turnNumber,
        startEventSeq: ev.seq,
        endEventSeq: ev.seq,
        time: ev.time ?? null,
        promptPreview: "",
        responsePreview: "",
        toolCallCount: 0,
        originalSurfaceSeqs: [],
        activeSurfaceSeqs: [],
        activeTokens: 0,
        originalTokensEstimate: 0,
        status: "empty",
        foldId: null,
        foldTitle: null,
        markLabel: markByTurn.get(turnNumber)?.label ?? null
      };
      continue;
    }
    if (!current) continue;
    current.endEventSeq = ev.seq;
    if (ev.type === "tool/call") {
      current.toolCallCount += 1;
    }
    if (ev.surfaceOp === "append") {
      current.originalSurfaceSeqs.push(ev.seq);
      current.originalTokensEstimate += estimateEventTokens(ev);
      if (surfaceSet.has(ev.seq)) {
        current.activeSurfaceSeqs.push(ev.seq);
        current.activeTokens += tokenBySeq.get(ev.seq) ?? 0;
      }
    }
    if (ev.type === "user/message" && ev.surfaceOp === "append" && !current.promptPreview) {
      const txt = extractTextFromContent(ev.data?.content);
      if (!isSyntheticUserText(txt)) {
        current.promptPreview = collapseWhitespace(txt).slice(0, 120);
      }
    }
    if (ev.type === "assistant/message" && ev.surfaceOp === "append") {
      const txt = extractTextFromContent(ev.data?.message?.content);
      if (txt.trim()) {
        current.responsePreview = collapseWhitespace(txt).slice(0, 140);
      }
    }
  }
  if (current) turns.push(current);
  for (const t of turns) {
    const matchedFold = foldByTurn.get(t.turn);
    if (t.activeSurfaceSeqs.length > 0) {
      t.status = "active";
    } else if (t.originalSurfaceSeqs.length > 0) {
      t.status = "folded";
      if (matchedFold) {
        t.foldId = matchedFold.foldId;
        t.foldTitle = matchedFold.title;
      }
    } else {
      t.status = "empty";
    }
  }
  const enrichedFolds = folds.map((f) => {
    const activeInSurface = typeof f.checkpointSeq === "number" && surfaceSet.has(f.checkpointSeq);
    const liveTokens = activeInSurface ? tokenBySeq.get(f.checkpointSeq) ?? f.foldedTokens ?? 0 : 0;
    return {
      ...f,
      activeInSurface,
      liveTokens
    };
  });
  let openTurn = false;
  for (const ev of events) {
    if (ev?.type === "turn/start") openTurn = true;
    else if (ev?.type === "turn/end") openTurn = false;
  }
  return {
    sessionId: session.id,
    cwd: session.cwd ?? session.header?.cwd ?? null,
    totalSurfaceTokens: totalTokens,
    surfaceNodeCount: surfaceNodes.length,
    turnCount: turns.length,
    isIdle: !openTurn,
    turns,
    folds: enrichedFolds,
    marks
  };
}
function resolveSafeSurfaceRange(session, startTurn, endTurn, { tokenMeter = null, folds = [] } = {}) {
  const sTurn = Number(startTurn);
  const eTurn = Number(endTurn);
  if (!Number.isInteger(sTurn) || !Number.isInteger(eTurn) || sTurn < 1 || eTurn < sTurn) {
    throw new Error(`\u8F6E\u6B21\u533A\u95F4\u65E0\u6548\uFF1A${startTurn}-${endTurn}\uFF08\u9700\u8981 startTurn >= 1 \u4E14 endTurn >= startTurn\uFF09`);
  }
  const inspection = inspectSessionTurns(session, { tokenMeter, folds });
  if (eTurn > inspection.turnCount) {
    throw new Error(`\u7ED3\u675F\u8F6E\u6B21 ${eTurn} \u8D85\u51FA\u5F53\u524D\u603B\u8F6E\u6B21 ${inspection.turnCount}`);
  }
  const events = readSessionEvents(session);
  const balance = computeToolPairingBalance(session);
  const nodes = balance.nodes;
  const { tokenBySeq } = measureSurfaceNodeTokens(session, tokenMeter);
  const selectedTurns = inspection.turns.filter((t) => t.turn >= sTurn && t.turn <= eTurn);
  const targetSeqSet = /* @__PURE__ */ new Set();
  for (const t of selectedTurns) {
    for (const seq of t.activeSurfaceSeqs) {
      targetSeqSet.add(seq);
    }
  }
  for (const f of folds) {
    if (f.startTurn >= sTurn && f.endTurn <= eTurn && typeof f.checkpointSeq === "number" && balance.indexBySeq.has(f.checkpointSeq)) {
      targetSeqSet.add(f.checkpointSeq);
    }
  }
  if (targetSeqSet.size === 0) {
    throw new Error(`\u7B2C ${sTurn}\u2013${eTurn} \u8F6E\u5728\u5F53\u524D\u6A21\u578B\u4E0A\u4E0B\u6587\u4E2D\u5DF2\u65E0\u6D3B\u8DC3\u5185\u5BB9\uFF08\u53EF\u80FD\u5DF2\u88AB\u6298\u51FA\u6216\u538B\u7F29\uFF09`);
  }
  let minIdx = Infinity;
  let maxIdx = -1;
  for (const seq of targetSeqSet) {
    const idx = balance.indexBySeq.get(seq);
    if (idx !== void 0) {
      if (idx < minIdx) minIdx = idx;
      if (idx > maxIdx) maxIdx = idx;
    }
  }
  if (minIdx === 0 && events[nodes[0]]?.type === "system/message") {
    minIdx = 1;
  }
  if (minIdx > maxIdx) {
    throw new Error(`\u7B2C ${sTurn}\u2013${eTurn} \u8F6E\u65E0\u53EF\u66FF\u6362\u7684\u975E\u7CFB\u7EDF\u6D88\u606F`);
  }
  while (minIdx > 0 && !balance.balancedBefore(nodes[minIdx])) {
    if (minIdx === 1 && events[nodes[0]]?.type === "system/message") break;
    minIdx -= 1;
  }
  while (maxIdx < nodes.length - 1 && !balance.balancedAfter(nodes[maxIdx])) {
    maxIdx += 1;
  }
  const startSeq = nodes[minIdx];
  const endSeq = nodes[maxIdx];
  if (!balance.balancedBefore(startSeq)) {
    throw new Error(`\u8D77\u59CB\u4F4D\u7F6E seq=${startSeq} \u5904\u4E8E\u672A\u95ED\u5408\u7684\u5DE5\u5177\u8C03\u7528\u4E2D\u95F4\uFF0C\u65E0\u6CD5\u5B89\u5168\u5207\u5206`);
  }
  if (!balance.balancedAfter(endSeq)) {
    throw new Error(`\u7ED3\u675F\u4F4D\u7F6E seq=${endSeq} \u5904\u4E8E\u672A\u95ED\u5408\u7684\u5DE5\u5177\u8C03\u7528\u4E2D\u95F4\uFF08\u53EF\u80FD\u5BF9\u8BDD\u5C1A\u672A\u7ED3\u675F\uFF09\uFF0C\u65E0\u6CD5\u5B89\u5168\u5207\u5206`);
  }
  const shadowedSeqs = nodes.slice(minIdx, maxIdx + 1);
  let originalTokens = 0;
  for (const seq of shadowedSeqs) {
    originalTokens += tokenBySeq.get(seq) ?? 0;
  }
  return {
    startTurn: sTurn,
    endTurn: eTurn,
    startSeq,
    endSeq,
    shadowedSeqs,
    originalTokens
  };
}
function resolveSafeSurfaceSegments(session, turns, { tokenMeter = null, folds = [] } = {}) {
  const normalized = normalizeTurns(turns);
  if (normalized.length === 0) {
    throw new Error("\u8BF7\u81F3\u5C11\u9009\u62E9\u4E00\u8F6E\u9700\u8981\u6298\u51FA\u7684\u5BF9\u8BDD");
  }
  const groups = groupContiguousTurns(normalized);
  const segments = [];
  const allShadowedSeqs = [];
  let totalOriginalTokens = 0;
  for (const g of groups) {
    const seg = resolveSafeSurfaceRange(session, g.startTurn, g.endTurn, { tokenMeter, folds });
    if (segments.length > 0) {
      const prev = segments[segments.length - 1];
      if (seg.startSeq <= prev.endSeq) {
        const mergedStartSeq = prev.startSeq;
        const mergedEndSeq = Math.max(prev.endSeq, seg.endSeq);
        const balance = computeToolPairingBalance(session);
        const sIdx = balance.indexBySeq.get(mergedStartSeq);
        const eIdx = balance.indexBySeq.get(mergedEndSeq);
        const mergedShadowed = balance.nodes.slice(sIdx, eIdx + 1);
        const { tokenBySeq } = measureSurfaceNodeTokens(session, tokenMeter);
        let mergedTokens = 0;
        for (const seq of mergedShadowed) mergedTokens += tokenBySeq.get(seq) ?? 0;
        prev.endTurn = seg.endTurn;
        prev.endSeq = mergedEndSeq;
        prev.shadowedSeqs = mergedShadowed;
        prev.originalTokens = mergedTokens;
        continue;
      }
    }
    segments.push(seg);
  }
  for (const seg of segments) {
    allShadowedSeqs.push(...seg.shadowedSeqs);
    totalOriginalTokens += seg.originalTokens;
  }
  return {
    turns: normalized,
    startTurn: normalized[0],
    endTurn: normalized[normalized.length - 1],
    startSeq: segments[0].startSeq,
    endSeq: segments[segments.length - 1].endSeq,
    segments,
    shadowedSeqs: allShadowedSeqs,
    originalTokens: totalOriginalTokens
  };
}
function extractRangeTranscript(session, shadowedSeqs, { maxChars = 48e3 } = {}) {
  const events = readSessionEvents(session);
  const lines = [];
  const filesTouched = /* @__PURE__ */ new Set();
  const toolsUsed = /* @__PURE__ */ new Map();
  const errors = [];
  const userHighlights = [];
  const assistantHighlights = [];
  for (const seq of shadowedSeqs) {
    const ev = events[seq];
    if (!ev) continue;
    if (ev.type === "user/message") {
      const txt = extractTextFromContent(ev.data?.content).trim();
      if (!txt) continue;
      if (isSyntheticUserText(txt) && !txt.startsWith("[\u4E0A\u4E0B\u6587\u5C40\u90E8\u6298\u51FA")) continue;
      const clipped = clipText(txt, 2500);
      lines.push(`[USER seq=${seq}]
${clipped}`);
      if (userHighlights.length < 8) {
        userHighlights.push(collapseWhitespace(txt).slice(0, 160));
      }
    } else if (ev.type === "assistant/message") {
      const content = ev.data?.message?.content;
      if (!Array.isArray(content)) continue;
      const textParts = [];
      for (const block of content) {
        if (block?.type === "text" && typeof block.text === "string" && block.text.trim()) {
          textParts.push(block.text.trim());
        } else if (block?.type === "tool-call") {
          const toolName = block.name ?? "unknown";
          toolsUsed.set(toolName, (toolsUsed.get(toolName) ?? 0) + 1);
          collectPathsFromObject(block.arguments, filesTouched);
          lines.push(`[TOOL_CALL ${toolName}] ${clipText(JSON.stringify(block.arguments ?? {}), 320)}`);
        }
      }
      if (textParts.length > 0) {
        const joined = textParts.join("\n");
        lines.push(`[ASSISTANT seq=${seq}]
${clipText(joined, 3500)}`);
        assistantHighlights.push(collapseWhitespace(joined).slice(0, 220));
      }
    } else if (ev.type === "tool/result") {
      const msg = ev.data?.message ?? {};
      const isErr = msg.isError === true;
      const rawContent = typeof msg.content === "string" ? msg.content : Array.isArray(msg.content) ? extractTextFromContent(msg.content) : JSON.stringify(msg.content ?? "");
      if (isErr) {
        errors.push(collapseWhitespace(rawContent).slice(0, 180));
      }
      lines.push(`[TOOL_RESULT${isErr ? " ERROR" : ""} seq=${seq}] ${clipText(rawContent, 1200)}`);
    }
  }
  let transcript = lines.join("\n\n");
  if (transcript.length > maxChars) {
    const head = transcript.slice(0, Math.floor(maxChars * 0.45));
    const tail = transcript.slice(-Math.floor(maxChars * 0.5));
    transcript = `${head}

... [\u4E2D\u95F4\u8FC7\u7A0B\u5DF2\u6309\u957F\u5EA6\u622A\u65AD\uFF0C\u5171\u7701\u7565 ${transcript.length - head.length - tail.length} \u5B57\u7B26] ...

${tail}`;
  }
  return {
    transcript,
    facts: {
      filesTouched: [...filesTouched].slice(0, 30),
      toolsUsed: [...toolsUsed.entries()].map(([name2, count]) => `${name2}\xD7${count}`),
      errors: errors.slice(0, 10),
      userHighlights,
      assistantHighlights: assistantHighlights.slice(-6)
    }
  };
}
function collectPathsFromObject(obj, set, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 3) return;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && /(path|file|dir|cwd|target)/i.test(k) && v.length > 1 && v.length < 300) {
      set.add(v);
    } else if (v && typeof v === "object") {
      collectPathsFromObject(v, set, depth + 1);
    }
  }
}
function clipText(str, max) {
  if (!str || str.length <= max) return str ?? "";
  return `${str.slice(0, max)}\u2026(\u5DF2\u622A\u65AD\uFF0C\u539F\u957F ${str.length} \u5B57)`;
}
function collapseWhitespace(str) {
  return String(str ?? "").replace(/\s+/g, " ").trim();
}

// src/host/committer.js
function inspectLockState(session) {
  const events = readSessionEvents(session);
  let openTurn = false;
  let unmatchedCompactionStart = null;
  let latestEndSeedSeq = -1;
  for (const ev of events) {
    if (!ev) continue;
    if (ev.type === "turn/start") openTurn = true;
    else if (ev.type === "turn/end") openTurn = false;
    else if (ev.type === "session/end-seed") latestEndSeedSeq = ev.seq;
    else if (ev.type === "compaction/start") unmatchedCompactionStart = ev;
    else if (ev.type === "compaction/end") {
      if (unmatchedCompactionStart && ev.data?.compactionId === unmatchedCompactionStart.data?.compactionId) {
        unmatchedCompactionStart = null;
      }
    }
  }
  const compactionLocked = unmatchedCompactionStart !== null && latestEndSeedSeq <= unmatchedCompactionStart.seq;
  return { openTurn, compactionLocked };
}
async function withMaintenance(agent, fn) {
  if (agent && typeof agent.runMaintenance === "function") {
    return await agent.runMaintenance(async (agentSignal) => fn(agentSignal));
  }
  return await fn(void 0);
}
async function commitInitialFold({
  ctx,
  agent,
  session,
  foldId,
  title,
  turns,
  startTurn,
  endTurn,
  startSeq,
  endSeq,
  segments,
  expectedShadowedSeqs,
  filePath,
  summary,
  originalTokens,
  sourceCommandId,
  provider = "context-fold",
  model = "editable-file"
}) {
  const targetSession = session ?? agent?.session;
  if (!targetSession) throw new Error("\u65E0\u6CD5\u627E\u5230\u76EE\u6807\u4F1A\u8BDD\u5B9E\u4F8B");
  const resolvedSegments = Array.isArray(segments) && segments.length > 0 ? segments : [
    {
      startTurn,
      endTurn,
      startSeq,
      endSeq,
      shadowedSeqs: expectedShadowedSeqs,
      originalTokens
    }
  ];
  const resolvedTurns = normalizeTurns(turns, startTurn, endTurn);
  return await withMaintenance(agent, async () => {
    const lock = inspectLockState(targetSession);
    if (lock.openTurn) {
      throw new Error("\u5F53\u524D\u4F1A\u8BDD\u6B63\u5728\u8FD0\u884C\u4E2D\uFF0C\u8BF7\u7B49\u8FD9\u4E00\u8F6E\u56DE\u590D\u7ED3\u675F\u540E\u518D\u6267\u884C\u6298\u51FA");
    }
    if (lock.compactionLocked) {
      throw new Error("\u5F53\u524D\u4F1A\u8BDD\u6B63\u5728\u6267\u884C\u538B\u7F29\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5");
    }
    const initialBalance = computeToolPairingBalance(targetSession);
    const validatedSegments = [];
    for (const seg of resolvedSegments) {
      const sIdx = initialBalance.indexBySeq.get(seg.startSeq);
      const eIdx = initialBalance.indexBySeq.get(seg.endSeq);
      if (sIdx === void 0 || eIdx === void 0 || sIdx > eIdx) {
        throw new Error(
          `\u76EE\u6807\u533A\u95F4 seq ${seg.startSeq}..${seg.endSeq} \u5728\u5F53\u524D\u4E0A\u4E0B\u6587\u4E2D\u5DF2\u53D1\u751F\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210\u9884\u89C8`
        );
      }
      if (!initialBalance.balancedBefore(seg.startSeq) || !initialBalance.balancedAfter(seg.endSeq)) {
        throw new Error(`\u76EE\u6807\u533A\u95F4 seq ${seg.startSeq}..${seg.endSeq} \u8FB9\u754C\u672A\u5BF9\u9F50\u5DE5\u5177\u8C03\u7528\u5BF9\uFF0C\u5DF2\u4E2D\u6B62\u66FF\u6362`);
      }
      const liveShadowed = initialBalance.nodes.slice(sIdx, eIdx + 1);
      if (Array.isArray(seg.shadowedSeqs)) {
        const same = seg.shadowedSeqs.length === liveShadowed.length && seg.shadowedSeqs.every((seq, i) => seq === liveShadowed[i]);
        if (!same) {
          throw new Error("\u9884\u89C8\u671F\u95F4\u9009\u4E2D\u533A\u95F4\u7684\u5185\u5BB9\u53D1\u751F\u4E86\u53D8\u5316\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5");
        }
      }
      validatedSegments.push({ ...seg, liveShadowed });
    }
    const totalOriginal = typeof originalTokens === "number" && originalTokens > 0 ? originalTokens : validatedSegments.reduce((acc, s) => acc + (s.originalTokens ?? 0), 0);
    const segmentResults = [];
    let totalFoldedTokens = 0;
    for (let i = 0; i < validatedSegments.length; i++) {
      const seg = validatedSegments[i];
      const isPrimary = i === validatedSegments.length - 1;
      const text = isPrimary ? buildCheckpointText({
        foldId,
        title,
        turns: resolvedTurns,
        startTurn: resolvedTurns[0] ?? startTurn,
        endTurn: resolvedTurns[resolvedTurns.length - 1] ?? endTurn,
        filePath,
        summary,
        originalTokens: totalOriginal
      }) : buildSegmentStubText({
        foldId,
        title,
        startTurn: seg.startTurn,
        endTurn: seg.endTurn,
        filePath
      });
      const segFoldedTokens = estimateTokens(text);
      totalFoldedTokens += segFoldedTokens;
      const compactionId = randomUUID();
      const lifecycle = {
        compactionId,
        ...isPrimary && sourceCommandId !== void 0 ? { sourceCommandId } : {},
        turn: null
      };
      const startEvent = targetSession.append("compaction/start", lifecycle);
      let closed = false;
      try {
        const summaryEvent = targetSession.append("compaction/summary", {
          compactionId,
          ...isPrimary && sourceCommandId !== void 0 ? { sourceCommandId } : {},
          summary: [{ type: "text", text }],
          shadowedRange: { start: seg.startSeq, end: seg.endSeq },
          shadowedSeqs: [...seg.liveShadowed],
          shadowedTokenCount: seg.originalTokens ?? totalOriginal,
          provider,
          model
        });
        const checkpointMessage = {
          id: randomUUID(),
          role: "user",
          content: [{ type: "text", text }],
          source: {
            kind: "compact-checkpoint",
            compactionId,
            ...isPrimary && sourceCommandId !== void 0 ? { sourceCommandId } : {}
          }
        };
        const checkpointEvent = targetSession.append("user/message", checkpointMessage, {
          surfaceOp: {
            op: "replace",
            startSeq: seg.startSeq,
            endSeq: seg.endSeq
          },
          sourceEventSeqs: [startEvent.seq, summaryEvent.seq, ...seg.liveShadowed]
        });
        targetSession.append("compaction/end", lifecycle);
        closed = true;
        segmentResults.push({
          isPrimary,
          compactionId,
          startEventSeq: startEvent.seq,
          summarySeq: summaryEvent.seq,
          checkpointSeq: checkpointEvent.seq,
          startTurn: seg.startTurn,
          endTurn: seg.endTurn,
          shadowedSeqs: seg.liveShadowed,
          foldedTokens: segFoldedTokens
        });
      } catch (err) {
        if (!closed) {
          try {
            targetSession.append("compaction/end", {
              ...lifecycle,
              error: { message: err instanceof Error ? err.message : String(err) }
            });
          } catch {
          }
        }
        throw err;
      }
    }
    const sessions = ctx?.get?.("sessions") ?? ctx?.sessions;
    if (sessions && typeof sessions.flush === "function") {
      await sessions.flush(targetSession);
    }
    const primary = segmentResults[segmentResults.length - 1];
    const allShadowed = segmentResults.flatMap((r) => r.shadowedSeqs);
    return {
      compactionId: primary.compactionId,
      startEventSeq: primary.startEventSeq,
      summarySeq: primary.summarySeq,
      checkpointSeq: primary.checkpointSeq,
      segmentCheckpoints: segmentResults.map((r) => ({
        isPrimary: r.isPrimary,
        checkpointSeq: r.checkpointSeq,
        startTurn: r.startTurn,
        endTurn: r.endTurn
      })),
      shadowedSeqs: allShadowed,
      originalTokens: totalOriginal,
      foldedTokens: totalFoldedTokens,
      savedTokens: Math.max(0, totalOriginal - totalFoldedTokens)
    };
  });
}
async function commitResyncFold({
  ctx,
  agent,
  session,
  foldRecord,
  title,
  filePath,
  summary
}) {
  const targetSession = session ?? agent?.session;
  if (!targetSession) throw new Error("\u65E0\u6CD5\u627E\u5230\u76EE\u6807\u4F1A\u8BDD\u5B9E\u4F8B");
  const prevSeq = foldRecord.checkpointSeq;
  if (typeof prevSeq !== "number") {
    throw new Error("\u8BE5\u8BB0\u5F55\u5C1A\u672A\u5E94\u7528\u5230\u4E0A\u4E0B\u6587\uFF0C\u65E0\u6CD5\u540C\u6B65\uFF1B\u8BF7\u5148\u6267\u884C\u5E94\u7528\u6298\u51FA");
  }
  return await withMaintenance(agent, async () => {
    const lock = inspectLockState(targetSession);
    if (lock.openTurn) {
      throw new Error("\u5F53\u524D\u4F1A\u8BDD\u6B63\u5728\u8FD0\u884C\u4E2D\uFF0C\u8BF7\u7B49\u8FD9\u4E00\u8F6E\u56DE\u590D\u7ED3\u675F\u540E\u518D\u540C\u6B65\u4FEE\u6539");
    }
    if (lock.compactionLocked) {
      throw new Error("\u5F53\u524D\u4F1A\u8BDD\u6B63\u5728\u6267\u884C\u538B\u7F29\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5");
    }
    const balance = computeToolPairingBalance(targetSession);
    if (!balance.indexBySeq.has(prevSeq)) {
      throw new Error(
        `\u539F\u6298\u51FA\u8282\u70B9 seq=${prevSeq} \u5DF2\u4E0D\u5728\u5F53\u524D\u6A21\u578B\u4E0A\u4E0B\u6587\u4E2D\uFF08\u53EF\u80FD\u5DF2\u88AB\u540E\u7EED\u66F4\u5927\u8303\u56F4\u7684\u538B\u7F29\u5408\u5E76\uFF09\uFF0C\u65E0\u6CD5\u539F\u5730\u540C\u6B65`
      );
    }
    const checkpointText = buildCheckpointText({
      foldId: foldRecord.foldId,
      title: title ?? foldRecord.title,
      turns: foldRecord.turns,
      startTurn: foldRecord.startTurn,
      endTurn: foldRecord.endTurn,
      filePath: filePath ?? foldRecord.filePath,
      summary,
      originalTokens: foldRecord.originalTokens ?? 0
    });
    const foldedTokens = estimateTokens(checkpointText);
    const updatedMessage = {
      id: randomUUID(),
      role: "user",
      content: [{ type: "text", text: checkpointText }],
      source: {
        kind: "context-fold-sync",
        foldId: foldRecord.foldId
      }
    };
    const newEvent = targetSession.append("user/message", updatedMessage, {
      surfaceOp: {
        op: "replace",
        startSeq: prevSeq,
        endSeq: prevSeq
      },
      sourceEventSeqs: [prevSeq]
    });
    const sessions = ctx?.get?.("sessions") ?? ctx?.sessions;
    if (sessions && typeof sessions.flush === "function") {
      await sessions.flush(targetSession);
    }
    return {
      previousCheckpointSeq: prevSeq,
      checkpointSeq: newEvent.seq,
      foldedTokens,
      savedTokens: Math.max(0, (foldRecord.originalTokens ?? 0) - foldedTokens)
    };
  });
}

// src/host/distiller.js
var DISTILL_SYSTEM_PROMPT = [
  "\u4F60\u662F\u4E00\u4E2A\u5BF9\u8BDD\u4E0A\u4E0B\u6587\u5C40\u90E8\u6298\u51FA\uFF08Context Fold\uFF09\u63D0\u70BC\u5F15\u64CE\u3002",
  "\u7528\u6237\u6B63\u5728\u8FDB\u884C\u53D1\u6563\u6027\u601D\u8003\u6216\u65B9\u6848\u63A8\u6F14\uFF0C\u5E76\u5728\u4E00\u6BB5\u533A\u95F4\u5185\u7A7F\u63D2\u4E86\u5177\u4F53\u6570\u636E\u9A8C\u8BC1\u3001\u6848\u4F8B\u5206\u6790\u6216\u652F\u7EBF\u63A2\u7D22\u3002",
  "\u73B0\u5728\u8981\u628A\u8FD9\u6BB5\u533A\u95F4\u6298\u51FA\u6210\u4E00\u4EFD\u300C\u53CC\u5C42\u53EF\u7F16\u8F91 Markdown \u6587\u6863\u300D\uFF0C\u4E25\u683C\u5206\u6210\u4E24\u4E2A\u90E8\u5206\uFF1A",
  "",
  `1. ${SECTION_SUMMARY_HEADING}`,
  "   - \u8FD9\u90E8\u5206\u4F1A**\u76F4\u63A5\u66FF\u6362\u539F\u533A\u95F4\u5E76\u6CE8\u5165\u56DE\u4E3B\u7EBF\u4E0A\u4E0B\u6587**\uFF0C\u56E0\u6B64\u5FC5\u987B\u6781\u5EA6\u7CBE\u70BC\u3001\u9AD8\u4FE1\u566A\u6BD4\uFF08\u5EFA\u8BAE 4\u20138 \u6761\u77ED bullet\uFF0C\u63A7\u5236\u5728 180\u2013400 \u4E2D\u6587\u5B57\u4EE5\u5185\uFF09\u3002",
  "   - \u91CD\u70B9\u4FDD\u7559\uFF1A\u5DF2\u9A8C\u8BC1\u7684\u6838\u5FC3\u7ED3\u8BBA\u3001\u88AB\u63A8\u7FFB\u7684\u5047\u8BBE\u6216\u53CD\u4F8B\u3001\u65B0\u6D8C\u73B0\u7684\u76F4\u89C9/\u7075\u611F\u70B9\u3001\u4EE5\u53CA\u5C1A\u672A\u89E3\u51B3\u7684\u5173\u952E\u7591\u95EE\u3002",
  "   - \u4E25\u7981\u628A\u672A\u8FBE\u6210\u7684\u5206\u6B67\u5F3A\u884C\u5199\u6B7B\u6210\u201C\u5DF2\u786E\u5B9A\u5171\u8BC6\u201D\uFF1B\u672A\u5B9A\u9879\u8BF7\u660E\u786E\u6807\u51FA\u300C\u5F85\u5B9A/\u6709\u5206\u6B67\u300D\u3002",
  "   - \u53EA\u5199\u5BF9\u8BDD\u548C\u5DE5\u5177\u7ED3\u679C\u91CC\u5B9E\u9645\u51FA\u73B0\u8FC7\u7684\u4E8B\u5B9E\uFF0C\u7981\u6B62\u7F16\u9020\u6570\u636E\u6216\u4EE3\u7801\u7EC6\u8282\u3002",
  "",
  `2. ${SECTION_DETAIL_HEADING}`,
  "   - \u8FD9\u90E8\u5206**\u4E0D\u8FDB\u5165\u4E3B\u7EBF\u4E0A\u4E0B\u6587**\uFF0C\u4EC5\u4FDD\u5B58\u5728\u78C1\u76D8\u4F9B\u7528\u6237\u7F16\u8F91\u548C\u6A21\u578B\u540E\u7EED\u6309\u9700\u56DE\u67E5\u3002",
  "   - \u4FDD\u7559\u5B8C\u6574\u9A8C\u8BC1\u8FC7\u7A0B\uFF1A\u6D89\u53CA\u7684\u5177\u4F53\u6807\u7684/\u6570\u636E/\u65F6\u95F4\u70B9/\u6587\u4EF6/\u547D\u4EE4\u3001\u63A8\u6F14\u903B\u8F91\u3001\u5173\u952E\u539F\u59CB\u6570\u5B57\u4E0E\u8E29\u5751\u8BB0\u5F55\u3002",
  "",
  "\u8F93\u51FA\u683C\u5F0F\u786C\u6027\u8981\u6C42\uFF1A",
  "- \u6B63\u6587\u8BED\u8A00\u4E0E\u539F\u5BF9\u8BDD\u4FDD\u6301\u4E00\u81F4\uFF08\u539F\u5BF9\u8BDD\u4E3B\u8981\u4E3A\u82F1\u6587\u65F6\u8BF7\u7528\u82F1\u6587\u64B0\u5199\u6B63\u6587\u5185\u5BB9\uFF0C\u4F46\u4E0B\u65B9\u4E24\u4E2A\u4E8C\u7EA7\u6807\u9898\u4FDD\u6301\u56FA\u5B9A\u4E0D\u53D8\uFF09\u3002",
  `- \u76F4\u63A5\u8F93\u51FA\u4EE5 "${SECTION_SUMMARY_HEADING}" \u5F00\u5934\u7684 Markdown \u6B63\u6587\uFF0C\u4E0D\u8981\u5305\u5728 \`\`\`markdown \u4EE3\u7801\u5757\u91CC\uFF0C\u4E5F\u4E0D\u8981\u5199 YAML frontmatter\u3002`,
  `- \u5FC5\u987B\u5305\u542B "${SECTION_SUMMARY_HEADING}" \u548C "${SECTION_DETAIL_HEADING}" \u4E24\u4E2A\u4E8C\u7EA7\u6807\u9898\u3002`
].join("\n");
async function distillRange({
  ctx,
  agent,
  session,
  shadowedSeqs,
  turns,
  startTurn,
  endTurn,
  title,
  maxTokens = 4096,
  signal
}) {
  const { transcript, facts } = extractRangeTranscript(session, shadowedSeqs);
  const rangeCn = formatTurnRangeChinese(turns, startTurn, endTurn);
  const resolvedTitle = title && title.trim() || inferTitleFromFacts(facts, startTurn, endTurn);
  const llm = ctx?.get?.("llm") ?? ctx?.llm;
  const target = resolveLlmTarget(agent, session);
  if (!llm?.stream || !target) {
    return buildDeterministicFallback({
      title: resolvedTitle,
      rangeCn,
      facts,
      reason: "\u672A\u68C0\u6D4B\u5230\u53EF\u7528\u6A21\u578B\u8DEF\u7531\uFF0C\u5DF2\u81EA\u52A8\u4F7F\u7528\u786E\u5B9A\u6027\u63D0\u53D6"
    });
  }
  try {
    const userPrompt = [
      `\u8BF7\u63D0\u70BC\u4EE5\u4E0B${rangeCn}\u7684\u5BF9\u8BDD\u533A\u95F4\uFF08\u4E3B\u9898\u6807\u7B7E\uFF1A${resolvedTitle}\uFF09\uFF1A`,
      "",
      "--- \u5BF9\u8BDD\u4E0E\u5DE5\u5177\u8BB0\u5F55\u5F00\u59CB ---",
      transcript,
      "--- \u5BF9\u8BDD\u4E0E\u5DE5\u5177\u8BB0\u5F55\u7ED3\u675F ---"
    ].join("\n");
    const options = {
      provider: target.provider,
      model: target.model,
      messages: [
        {
          role: "system",
          content: [{ type: "text", text: DISTILL_SYSTEM_PROMPT }]
        },
        {
          role: "user",
          content: [{ type: "text", text: userPrompt }]
        }
      ],
      maxTokens,
      sessionId: session.id,
      purpose: "compaction",
      ...signal ? { signal } : {}
    };
    const rawText = await collectStreamText(llm.stream(options));
    const cleaned = stripOuterFence(rawText).trim();
    if (!cleaned) {
      throw new Error("\u6A21\u578B\u8FD4\u56DE\u4E86\u7A7A\u63D0\u70BC\u7ED3\u679C");
    }
    const parsed = parseFoldMarkdown(cleaned);
    if (!parsed.summary.trim()) {
      throw new Error("\u6A21\u578B\u8F93\u51FA\u7F3A\u5C11\u7CBE\u534E\u6BB5\u843D");
    }
    const details = parsed.details.trim() || buildDeterministicDetails(facts, rangeCn);
    return {
      title: resolvedTitle,
      summary: parsed.summary.trim(),
      details,
      generatedBy: "llm",
      provider: target.provider,
      model: target.model
    };
  } catch (err) {
    if (signal?.aborted) throw err;
    return buildDeterministicFallback({
      title: resolvedTitle,
      rangeCn,
      facts,
      reason: err instanceof Error ? err.message : String(err)
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
  return `\u7B2C${startTurn}-${endTurn}\u8F6E\u9A8C\u8BC1\u6298\u51FA`;
}
function buildDeterministicFallback({ title, rangeCn, facts, reason }) {
  const summaryLines = [
    `- **\u8303\u56F4**\uFF1A${rangeCn}\uFF08${title}\uFF09`
  ];
  if (facts.userHighlights.length > 0) {
    summaryLines.push(`- **\u8BA8\u8BBA\u8D77\u70B9**\uFF1A${facts.userHighlights[0]}`);
  }
  if (facts.assistantHighlights.length > 0) {
    summaryLines.push(
      `- **\u6536\u5C3E\u7ED3\u8BBA\u6458\u5F55**\uFF1A${facts.assistantHighlights[facts.assistantHighlights.length - 1]}`
    );
  }
  if (facts.errors.length > 0) {
    summaryLines.push(`- **\u9047\u5230\u5F02\u5E38**\uFF1A${facts.errors[0]}`);
  }
  summaryLines.push(`- _\uFF08\u8BF4\u660E\uFF1A\u672C\u6B21\u91C7\u7528\u786E\u5B9A\u6027\u63D0\u70BC\uFF0C\u539F\u56E0\uFF1A${reason}\uFF1B\u8BF7\u6309\u9700\u624B\u52A8\u6DA6\u8272\uFF09_`);
  return {
    title,
    summary: summaryLines.join("\n"),
    details: buildDeterministicDetails(facts, rangeCn),
    generatedBy: "deterministic"
  };
}
function buildDeterministicDetails(facts, rangeCn) {
  const lines = [`### \u533A\u95F4\u4E8B\u5B9E\u6E05\u5355\uFF08${rangeCn}\uFF09`, ""];
  if (facts.userHighlights.length > 0) {
    lines.push("#### \u7528\u6237\u6838\u5FC3\u63D0\u95EE");
    for (const u of facts.userHighlights) lines.push(`- ${u}`);
    lines.push("");
  }
  if (facts.assistantHighlights.length > 0) {
    lines.push("#### \u6A21\u578B\u5173\u952E\u56DE\u590D\u6458\u5F55");
    for (const a of facts.assistantHighlights) lines.push(`- ${a}`);
    lines.push("");
  }
  if (facts.toolsUsed.length > 0) {
    lines.push(`#### \u5DE5\u5177\u8C03\u7528\u7EDF\u8BA1`);
    lines.push(`- ${facts.toolsUsed.join("\u3001")}`);
    lines.push("");
  }
  if (facts.filesTouched.length > 0) {
    lines.push("#### \u6D89\u53CA\u6587\u4EF6/\u8DEF\u5F84");
    for (const f of facts.filesTouched) lines.push(`- \`${f}\``);
    lines.push("");
  }
  if (facts.errors.length > 0) {
    lines.push("#### \u5DE5\u5177\u62A5\u9519\u8BB0\u5F55");
    for (const e of facts.errors) lines.push(`- ${e}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}

// src/host/storage.js
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { randomUUID as randomUUID2 } from "node:crypto";
function getSessionFoldDir(workspaceRoot, sessionId, foldDirName = DEFAULT_FOLD_DIR_NAME) {
  const safeSession = sanitizeSegment(sessionId || "default-session");
  const base = resolve(workspaceRoot, foldDirName);
  const dir = resolve(base, safeSession);
  assertInside(base, dir);
  return dir;
}
function assertInside(root, target) {
  const normRoot = normalize(resolve(root));
  const normTarget = normalize(resolve(target));
  const rel = relative(normRoot, normTarget);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`\u8DEF\u5F84\u8D8A\u754C\uFF1A${target} \u4E0D\u5728\u5141\u8BB8\u76EE\u5F55 ${root} \u5185`);
  }
  return normTarget;
}
async function atomicWriteText(filePath, content) {
  const tmpPath = `${filePath}.${randomUUID2().slice(0, 8)}.tmp`;
  await writeFile(tmpPath, content, "utf8");
  await rename(tmpPath, filePath);
}
async function loadSessionState(workspaceRoot, sessionId, foldDirName = DEFAULT_FOLD_DIR_NAME) {
  const dir = getSessionFoldDir(workspaceRoot, sessionId, foldDirName);
  const statePath = join(dir, "folds.json");
  try {
    const raw = await readFile(statePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      version: 1,
      sessionId,
      marks: Array.isArray(parsed.marks) ? parsed.marks : [],
      folds: Array.isArray(parsed.folds) ? parsed.folds : [],
      drafts: Array.isArray(parsed.drafts) ? parsed.drafts : []
    };
  } catch (err) {
    if (err && err.code === "ENOENT") {
      return {
        version: 1,
        sessionId,
        marks: [],
        folds: [],
        drafts: []
      };
    }
    throw err;
  }
}
async function ensureFoldRoot(workspaceRoot, foldDirName = DEFAULT_FOLD_DIR_NAME) {
  const base = resolve(workspaceRoot, foldDirName);
  await mkdir(base, { recursive: true });
  const gitignorePath = join(base, ".gitignore");
  try {
    await readFile(gitignorePath, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") {
      await atomicWriteText(
        gitignorePath,
        "# Auto-generated by dsh-context-fold so folded session archives stay out of Git\n*\n"
      );
    }
  }
  return base;
}
async function saveSessionState(workspaceRoot, sessionId, state, foldDirName = DEFAULT_FOLD_DIR_NAME) {
  await ensureFoldRoot(workspaceRoot, foldDirName);
  const dir = getSessionFoldDir(workspaceRoot, sessionId, foldDirName);
  await mkdir(dir, { recursive: true });
  const statePath = join(dir, "folds.json");
  await atomicWriteText(statePath, JSON.stringify(state, null, 2) + "\n");
  await writeIndexMarkdown(dir, state);
  return statePath;
}
async function saveDraftFile({
  workspaceRoot,
  sessionId,
  foldDirName = DEFAULT_FOLD_DIR_NAME,
  foldId,
  title,
  turns,
  startTurn,
  endTurn,
  startSeq,
  endSeq,
  segments,
  originalTokens,
  foldedTokens,
  generatedBy,
  summary,
  details
}) {
  await ensureFoldRoot(workspaceRoot, foldDirName);
  const dir = getSessionFoldDir(workspaceRoot, sessionId, foldDirName);
  await mkdir(dir, { recursive: true });
  const state = await loadSessionState(workspaceRoot, sessionId, foldDirName);
  const nextSeqNum = state.folds.length + state.drafts.length + 1;
  const prefix = String(nextSeqNum).padStart(2, "0");
  const resolvedTurns = normalizeTurns(turns, startTurn, endTurn);
  const slug = slugifyTitle(title) || `turns-${resolvedTurns[0] ?? startTurn}-${resolvedTurns[resolvedTurns.length - 1] ?? endTurn}`;
  const fileName = `${prefix}-${slug}-${foldId.slice(0, 6)}.md`;
  const filePath = assertInside(dir, join(dir, fileName));
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const markdown = serializeFoldMarkdown({
    foldId,
    title,
    sessionId,
    turns: resolvedTurns,
    startTurn: resolvedTurns[0] ?? startTurn,
    endTurn: resolvedTurns[resolvedTurns.length - 1] ?? endTurn,
    startSeq,
    endSeq,
    checkpointSeq: null,
    originalTokens,
    foldedTokens,
    generatedBy,
    createdAt: now,
    updatedAt: now,
    summary,
    details
  });
  await atomicWriteText(filePath, markdown);
  const relPath = relative(workspaceRoot, filePath).split(sep).join("/");
  const draft = {
    foldId,
    title,
    turns: resolvedTurns,
    startTurn: resolvedTurns[0] ?? startTurn,
    endTurn: resolvedTurns[resolvedTurns.length - 1] ?? endTurn,
    startSeq,
    endSeq,
    ...Array.isArray(segments) ? { segments } : {},
    originalTokens,
    foldedTokens,
    generatedBy,
    fileName,
    filePath,
    relativePath: relPath,
    createdAt: now,
    updatedAt: now
  };
  state.drafts = state.drafts.filter((d) => d.foldId !== foldId);
  state.drafts.push(draft);
  await saveSessionState(workspaceRoot, sessionId, state, foldDirName);
  return { draft, markdown, filePath, relativePath: relPath };
}
async function readFoldFile(workspaceRoot, sessionId, filePathOrName, foldDirName = DEFAULT_FOLD_DIR_NAME) {
  const dir = getSessionFoldDir(workspaceRoot, sessionId, foldDirName);
  const resolved = isAbsolute(filePathOrName) ? assertInside(dir, filePathOrName) : assertInside(dir, join(dir, basename(filePathOrName)));
  const raw = await readFile(resolved, "utf8");
  return {
    filePath: resolved,
    raw,
    parsed: parseFoldMarkdown(raw)
  };
}
async function updateFoldFile({
  workspaceRoot,
  sessionId,
  filePath,
  foldDirName = DEFAULT_FOLD_DIR_NAME,
  title,
  summary,
  details,
  patchMeta = {}
}) {
  const dir = getSessionFoldDir(workspaceRoot, sessionId, foldDirName);
  const safePath = assertInside(dir, filePath);
  const raw = await readFile(safePath, "utf8");
  const parsed = parseFoldMarkdown(raw);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const updatedMarkdown = serializeFoldMarkdown({
    ...parsed.meta,
    ...patchMeta,
    foldId: patchMeta.foldId ?? parsed.meta.foldId ?? randomUUID2(),
    sessionId,
    title: title ?? parsed.title,
    summary: summary ?? parsed.summary,
    details: details ?? parsed.details,
    updatedAt: now
  });
  await atomicWriteText(safePath, updatedMarkdown);
  return { filePath: safePath, markdown: updatedMarkdown, updatedAt: now };
}
async function writeIndexMarkdown(dir, state) {
  const lines = [
    `# \u4E0A\u4E0B\u6587\u6298\u51FA\u6863\u6848\u7D22\u5F15`,
    "",
    `- \u4F1A\u8BDD ID\uFF1A\`${state.sessionId}\``,
    `- \u5DF2\u6298\u51FA\u6BB5\u843D\u6570\uFF1A${state.folds.length}`,
    `- \u66F4\u65B0\u65F6\u95F4\uFF1A${(/* @__PURE__ */ new Date()).toISOString()}`,
    ""
  ];
  if (state.folds.length === 0) {
    lines.push("_\u5C1A\u65E0\u5DF2\u6298\u51FA\u7684\u6BB5\u843D\u3002_");
  } else {
    lines.push("| # | \u6807\u9898 | \u8F6E\u6B21 | \u539F Token | \u6298\u540E Token | \u8282\u7701 | \u6587\u4EF6 |");
    lines.push("|---|---|---|---:|---:|---:|---|");
    state.folds.forEach((f, idx) => {
      const saved = Math.max(0, (f.originalTokens ?? 0) - (f.foldedTokens ?? 0));
      const rangeCn = formatTurnRangeChinese(f.turns, f.startTurn, f.endTurn);
      lines.push(
        `| ${idx + 1} | ${escapePipe(f.title)} | ${rangeCn} | ${f.originalTokens ?? 0} | ${f.foldedTokens ?? 0} | -${saved} | \`${f.fileName}\` |`
      );
    });
  }
  lines.push("");
  await atomicWriteText(join(dir, "INDEX.md"), lines.join("\n"));
}
function escapePipe(str) {
  return String(str ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}
function sanitizeSegment(str) {
  return String(str ?? "session").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 96);
}
function slugifyTitle(title) {
  return String(title ?? "").trim().replace(/[\\/:*?"<>|\s]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

// src/host/service.js
var ContextFoldService = class {
  constructor(ctx, config = {}) {
    this.ctx = ctx;
    this.foldDirName = config.foldDirName || DEFAULT_FOLD_DIR_NAME;
    this.maxDistillTokens = Number(config.maxDistillTokens) || 4096;
  }
  getService(name2) {
    if (this.ctx && typeof this.ctx.get === "function") {
      return this.ctx.get(name2);
    }
    return this.ctx?.[name2];
  }
  /**
   * Resolve a session for read-only operations (inspect / mark / prepare / readDocument).
   * Prefers live agent/session; transparently falls back to `sessionQuery.readSession()`
   * so historical sessions opened in the UI work immediately without needing a prompt first.
   */
  async resolveReadableTarget(sessionId, agentOverride) {
    const agents = this.getService("agents");
    const sessions = this.getService("sessions");
    const agent = agentOverride ?? agents?.get?.(sessionId) ?? null;
    const liveSession = agent?.session ?? sessions?.get?.(sessionId) ?? null;
    if (liveSession) {
      const workspaceRoot = liveSession.cwd ?? liveSession.header?.cwd;
      if (!workspaceRoot) {
        throw new Error("\u5F53\u524D\u4F1A\u8BDD\u6CA1\u6709\u7ED1\u5B9A\u5DE5\u4F5C\u533A\u76EE\u5F55\uFF0C\u65E0\u6CD5\u8BFB\u5199\u6298\u51FA\u6587\u4EF6");
      }
      return { agent, session: liveSession, workspaceRoot, isLive: true };
    }
    const sessionQuery = this.getService("sessionQuery");
    if (sessionQuery && typeof sessionQuery.readSession === "function") {
      const loaded = await sessionQuery.readSession(sessionId);
      const header = loaded?.session ?? {};
      const events = Array.isArray(loaded?.events) ? loaded.events : [];
      const workspaceRoot = header.cwd;
      if (!workspaceRoot) {
        throw new Error("\u8BE5\u5386\u53F2\u4F1A\u8BDD\u6CA1\u6709\u7ED1\u5B9A\u5DE5\u4F5C\u533A\u76EE\u5F55\uFF0C\u65E0\u6CD5\u8BFB\u5199\u6298\u51FA\u6587\u4EF6");
      }
      const readonlySession = buildReadonlySessionView(sessionId, header, events);
      return { agent: null, session: readonlySession, workspaceRoot, isLive: false };
    }
    throw new Error(`\u672A\u627E\u5230\u4F1A\u8BDD ${sessionId}\uFF08\u8BF7\u5148\u6253\u5F00\u8BE5\u4F1A\u8BDD\uFF09`);
  }
  /**
   * Resolve a live writable session + agent for mutating the surface (`applyFold`, `syncFold`).
   * Prefers DSH's `sessionController` resume path so the session's original Agent Preset is preserved.
   */
  async resolveWritableTarget(sessionId, agentOverride) {
    const agents = this.getService("agents");
    const sessions = this.getService("sessions");
    let agent = agentOverride ?? agents?.get?.(sessionId) ?? null;
    let session = agent?.session ?? sessions?.get?.(sessionId) ?? null;
    if (!session) {
      const controller = this.getService("sessionController");
      if (controller?.agents && typeof controller.agents.resume === "function") {
        try {
          agent = await controller.agents.resume(sessionId);
          session = agent?.session ?? sessions?.get?.(sessionId) ?? null;
        } catch {
        }
      }
    }
    if (!session && agents && typeof agents.resume === "function") {
      try {
        const setup = await this.buildPresetResumeSetup(sessionId);
        const resumed = await agents.resume({
          resumeSessionId: sessionId,
          ...setup ? { setup } : {}
        });
        agent = resumed?.agent ?? agents.get?.(sessionId) ?? null;
        session = agent?.session ?? sessions?.get?.(sessionId) ?? null;
      } catch (err) {
        throw new Error(
          `\u8BE5\u5386\u53F2\u4F1A\u8BDD\u5C1A\u672A\u6FC0\u6D3B\uFF0C\u81EA\u52A8\u5524\u9192\u5931\u8D25\uFF08${err instanceof Error ? err.message : String(err)}\uFF09\u3002\u4F60\u53EF\u4EE5\u5148\u5728\u5DE6\u4FA7\u8BE5\u4F1A\u8BDD\u91CC\u968F\u4FBF\u53D1\u4E00\u6761\u6D88\u606F\u6216\u8FD0\u884C /fold-apply \u6FC0\u6D3B\u540E\u518D\u64CD\u4F5C\u3002`
        );
      }
    }
    if (!session) {
      throw new Error(`\u672A\u627E\u5230\u53EF\u5199\u5165\u7684\u6D3B\u8DC3\u4F1A\u8BDD ${sessionId}\uFF08\u8BF7\u5148\u5728\u5BF9\u8BDD\u6846\u53D1\u4E00\u6761\u6D88\u606F\u6216\u8FD0\u884C /fold-apply\uFF09`);
    }
    const workspaceRoot = session.cwd ?? session.header?.cwd;
    if (!workspaceRoot) {
      throw new Error("\u5F53\u524D\u4F1A\u8BDD\u6CA1\u6709\u7ED1\u5B9A\u5DE5\u4F5C\u533A\u76EE\u5F55\uFF0C\u65E0\u6CD5\u8BFB\u5199\u6298\u51FA\u6587\u4EF6");
    }
    return { agent, session, workspaceRoot };
  }
  async buildPresetResumeSetup(sessionId) {
    const presets = this.getService("agentPresets");
    const sessionQuery = this.getService("sessionQuery");
    if (!presets || typeof presets.resolve !== "function" || typeof presets.mount !== "function") {
      return void 0;
    }
    try {
      let presetId;
      if (sessionQuery && typeof sessionQuery.readSession === "function") {
        const loaded = await sessionQuery.readSession(sessionId);
        const events = Array.isArray(loaded?.events) ? loaded.events : [];
        for (let i = events.length - 1; i >= 0; i--) {
          if (events[i]?.type === "agent-preset/selected" && events[i]?.data?.presetId) {
            presetId = events[i].data.presetId;
            break;
          }
        }
      }
      const resolvedId = (await presets.resolve(presetId)).id;
      return async (agentCtx) => {
        await presets.mount(agentCtx, resolvedId);
      };
    } catch {
      return void 0;
    }
  }
  async inspect(sessionId, { agent: agentOverride } = {}) {
    const { session, workspaceRoot, isLive } = await this.resolveReadableTarget(sessionId, agentOverride);
    const state = await loadSessionState(workspaceRoot, session.id, this.foldDirName);
    const snapshot = inspectSessionTurns(session, {
      tokenMeter: isLive ? this.getService("tokenMeter") ?? null : null,
      folds: state.folds,
      marks: state.marks
    });
    return {
      ...snapshot,
      isLive,
      drafts: state.drafts,
      foldDirName: this.foldDirName
    };
  }
  async addMark(sessionId, { agent: agentOverride, label = "", turn } = {}) {
    const { session, workspaceRoot, isLive } = await this.resolveReadableTarget(sessionId, agentOverride);
    const state = await loadSessionState(workspaceRoot, session.id, this.foldDirName);
    const snapshot = inspectSessionTurns(session, {
      tokenMeter: isLive ? this.getService("tokenMeter") ?? null : null,
      folds: state.folds,
      marks: state.marks
    });
    const targetTurn = turn !== void 0 && turn !== null && turn !== "" ? Number(turn) : snapshot.turnCount + 1;
    if (!Number.isInteger(targetTurn) || targetTurn < 1) {
      throw new Error(`\u65E0\u6548\u7684\u6807\u8BB0\u8F6E\u6B21\uFF1A${turn}`);
    }
    const mark = {
      markId: randomUUID3().slice(0, 8),
      turn: targetTurn,
      label: String(label ?? "").trim() || `\u9A8C\u8BC1\u8D77\u70B9 #${state.marks.length + 1}`,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    state.marks = state.marks.filter((m) => m.turn !== targetTurn);
    state.marks.push(mark);
    state.marks.sort((a, b) => a.turn - b.turn);
    await saveSessionState(workspaceRoot, session.id, state, this.foldDirName);
    return mark;
  }
  async removeMark(sessionId, { agent: agentOverride, markId } = {}) {
    const { session, workspaceRoot } = await this.resolveReadableTarget(sessionId, agentOverride);
    const state = await loadSessionState(workspaceRoot, session.id, this.foldDirName);
    const before = state.marks.length;
    state.marks = state.marks.filter((m) => m.markId !== markId);
    await saveSessionState(workspaceRoot, session.id, state, this.foldDirName);
    return { removed: before - state.marks.length };
  }
  /**
   * Step 1 of two-step fold: distill selected turn range into an editable Markdown draft file.
   */
  async prepareFold(sessionId, { agent: agentOverride, turns, startTurn, endTurn, title = "", signal } = {}) {
    const { agent, session, workspaceRoot, isLive } = await this.resolveReadableTarget(sessionId, agentOverride);
    const state = await loadSessionState(workspaceRoot, session.id, this.foldDirName);
    const selectedTurns = normalizeTurns(turns, startTurn, endTurn);
    const resolved = resolveSafeSurfaceSegments(session, selectedTurns, {
      tokenMeter: isLive ? this.getService("tokenMeter") ?? null : null,
      folds: state.folds
    });
    const distilled = await distillRange({
      ctx: this.ctx,
      agent,
      session,
      shadowedSeqs: resolved.shadowedSeqs,
      turns: resolved.turns,
      startTurn: resolved.startTurn,
      endTurn: resolved.endTurn,
      title,
      maxTokens: this.maxDistillTokens,
      signal
    });
    const foldId = randomUUID3().slice(0, 12);
    const previewCheckpoint = buildCheckpointText({
      foldId,
      title: distilled.title,
      turns: resolved.turns,
      startTurn: resolved.startTurn,
      endTurn: resolved.endTurn,
      filePath: `${this.foldDirName}/${session.id}/...`,
      summary: distilled.summary,
      originalTokens: resolved.originalTokens
    });
    const stubOverhead = Math.max(0, resolved.segments.length - 1) * 35;
    const foldedTokens = estimateTokens(previewCheckpoint) + stubOverhead;
    const saved = await saveDraftFile({
      workspaceRoot,
      sessionId: session.id,
      foldDirName: this.foldDirName,
      foldId,
      title: distilled.title,
      turns: resolved.turns,
      startTurn: resolved.startTurn,
      endTurn: resolved.endTurn,
      startSeq: resolved.startSeq,
      endSeq: resolved.endSeq,
      segments: resolved.segments,
      originalTokens: resolved.originalTokens,
      foldedTokens,
      generatedBy: distilled.generatedBy,
      summary: distilled.summary,
      details: distilled.details
    });
    const latestState = await loadSessionState(workspaceRoot, session.id, this.foldDirName);
    const draftEntry = latestState.drafts.find((d) => d.foldId === foldId);
    if (draftEntry) {
      draftEntry.shadowedSeqs = [...resolved.shadowedSeqs];
      draftEntry.segments = resolved.segments;
      draftEntry.provider = distilled.provider ?? "context-fold";
      draftEntry.model = distilled.model ?? distilled.generatedBy;
      await saveSessionState(workspaceRoot, session.id, latestState, this.foldDirName);
    }
    return {
      draft: draftEntry ?? saved.draft,
      title: distilled.title,
      summary: distilled.summary,
      details: distilled.details,
      markdown: saved.markdown,
      filePath: saved.filePath,
      relativePath: saved.relativePath,
      originalTokens: resolved.originalTokens,
      foldedTokens,
      savedTokens: Math.max(0, resolved.originalTokens - foldedTokens)
    };
  }
  /**
   * Step 2 of two-step fold: apply a draft (with any user edits) to the live session surface.
   */
  async applyFold(sessionId, { agent: agentOverride, foldId, title, summary, details, sourceCommandId } = {}) {
    const { agent, session, workspaceRoot } = await this.resolveWritableTarget(sessionId, agentOverride);
    const state = await loadSessionState(workspaceRoot, session.id, this.foldDirName);
    const draft = foldId ? state.drafts.find((d) => d.foldId === foldId || d.fileName === foldId) : state.drafts[state.drafts.length - 1];
    if (!draft) {
      throw new Error(foldId ? `\u627E\u4E0D\u5230\u5F85\u5E94\u7528\u7684\u9884\u89C8\u8349\u7A3F\uFF1A${foldId}` : "\u5F53\u524D\u6CA1\u6709\u5F85\u5E94\u7528\u7684\u9884\u89C8\u8349\u7A3F\uFF0C\u8BF7\u5148\u751F\u6210\u9884\u89C8");
    }
    const diskDoc = await readFoldFile(workspaceRoot, session.id, draft.filePath, this.foldDirName);
    const finalTitle = (title ?? diskDoc.parsed.title ?? draft.title).trim() || draft.title;
    const finalSummary = (summary ?? diskDoc.parsed.summary ?? "").trim();
    const finalDetails = (details ?? diskDoc.parsed.details ?? "").trim();
    if (!finalSummary) {
      throw new Error("\u300C\u6CE8\u5165\u4E3B\u7EBF\u7684\u7CBE\u534E\u300D\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A\uFF0C\u8BF7\u8865\u5145\u540E\u518D\u786E\u8BA4\u6298\u51FA");
    }
    const draftTurns = normalizeTurns(draft.turns, draft.startTurn, draft.endTurn);
    const commitRes = await commitInitialFold({
      ctx: this.ctx,
      agent,
      session,
      foldId: draft.foldId,
      title: finalTitle,
      turns: draftTurns,
      startTurn: draft.startTurn,
      endTurn: draft.endTurn,
      startSeq: draft.startSeq,
      endSeq: draft.endSeq,
      segments: draft.segments,
      expectedShadowedSeqs: draft.shadowedSeqs,
      filePath: draft.relativePath || draft.filePath,
      summary: finalSummary,
      originalTokens: draft.originalTokens,
      sourceCommandId,
      provider: draft.provider ?? "context-fold",
      model: draft.model ?? "editable-file"
    });
    const updated = await updateFoldFile({
      workspaceRoot,
      sessionId: session.id,
      filePath: draft.filePath,
      foldDirName: this.foldDirName,
      title: finalTitle,
      summary: finalSummary,
      details: finalDetails,
      patchMeta: {
        turns: draftTurns,
        checkpointSeq: commitRes.checkpointSeq,
        foldedTokens: commitRes.foldedTokens
      }
    });
    const foldRecord = {
      foldId: draft.foldId,
      title: finalTitle,
      turns: draftTurns,
      startTurn: draft.startTurn,
      endTurn: draft.endTurn,
      startSeq: draft.startSeq,
      endSeq: draft.endSeq,
      checkpointSeq: commitRes.checkpointSeq,
      segmentCheckpoints: commitRes.segmentCheckpoints,
      summarySeq: commitRes.summarySeq,
      compactionId: commitRes.compactionId,
      originalTokens: draft.originalTokens,
      foldedTokens: commitRes.foldedTokens,
      savedTokens: commitRes.savedTokens,
      generatedBy: draft.generatedBy,
      fileName: draft.fileName,
      filePath: draft.filePath,
      relativePath: draft.relativePath,
      createdAt: draft.createdAt,
      updatedAt: updated.updatedAt,
      syncCount: 0
    };
    const foldedTurnSet = new Set(draftTurns);
    state.drafts = state.drafts.filter((d) => d.foldId !== draft.foldId);
    state.folds = state.folds.filter((f) => f.foldId !== draft.foldId);
    state.folds.push(foldRecord);
    state.marks = state.marks.filter((m) => !foldedTurnSet.has(m.turn));
    await saveSessionState(workspaceRoot, session.id, state, this.foldDirName);
    return {
      fold: foldRecord,
      commit: commitRes
    };
  }
  /**
   * Discard an unapplied draft entry.
   */
  async discardDraft(sessionId, { agent: agentOverride, foldId } = {}) {
    const { session, workspaceRoot } = await this.resolveReadableTarget(sessionId, agentOverride);
    const state = await loadSessionState(workspaceRoot, session.id, this.foldDirName);
    state.drafts = state.drafts.filter((d) => d.foldId !== foldId);
    await saveSessionState(workspaceRoot, session.id, state, this.foldDirName);
    return { ok: true };
  }
  /**
   * Read an existing fold or draft file directly from disk.
   */
  async readDocument(sessionId, { agent: agentOverride, foldId } = {}) {
    const { session, workspaceRoot } = await this.resolveReadableTarget(sessionId, agentOverride);
    const state = await loadSessionState(workspaceRoot, session.id, this.foldDirName);
    const rec = state.folds.find((f) => f.foldId === foldId || f.fileName === foldId) ?? state.drafts.find((d) => d.foldId === foldId || d.fileName === foldId);
    if (!rec) {
      throw new Error(`\u672A\u627E\u5230\u6298\u51FA\u8BB0\u5F55\uFF1A${foldId}`);
    }
    const doc = await readFoldFile(workspaceRoot, session.id, rec.filePath, this.foldDirName);
    return {
      record: rec,
      title: doc.parsed.title,
      summary: doc.parsed.summary,
      details: doc.parsed.details,
      raw: doc.raw
    };
  }
  /**
   * Save edits directly to the Markdown archive file on disk without mutating the live surface.
   * Useful for archived folds that were later merged into a larger compaction.
   */
  async saveDocumentOnly(sessionId, { agent: agentOverride, foldId, title, summary, details } = {}) {
    const { session, workspaceRoot } = await this.resolveReadableTarget(sessionId, agentOverride);
    const state = await loadSessionState(workspaceRoot, session.id, this.foldDirName);
    const rec = state.folds.find((f) => f.foldId === foldId || f.fileName === foldId) ?? state.drafts.find((d) => d.foldId === foldId || d.fileName === foldId);
    if (!rec) {
      throw new Error(`\u672A\u627E\u5230\u6298\u51FA\u8BB0\u5F55\uFF1A${foldId}`);
    }
    const updated = await updateFoldFile({
      workspaceRoot,
      sessionId: session.id,
      filePath: rec.filePath,
      foldDirName: this.foldDirName,
      title: title ?? rec.title,
      summary,
      details
    });
    if (title && title.trim()) rec.title = title.trim();
    rec.updatedAt = updated.updatedAt;
    await saveSessionState(workspaceRoot, session.id, state, this.foldDirName);
    return { record: rec, updatedAt: updated.updatedAt };
  }
  /**
   * Re-sync an edited fold Markdown file into the live model surface (in-place replacement).
   */
  async syncFold(sessionId, { agent: agentOverride, foldId, title, summary, details } = {}) {
    const { agent, session, workspaceRoot } = await this.resolveWritableTarget(sessionId, agentOverride);
    const state = await loadSessionState(workspaceRoot, session.id, this.foldDirName);
    const foldRecord = foldId ? state.folds.find((f) => f.foldId === foldId || f.fileName === foldId) : state.folds[state.folds.length - 1];
    if (!foldRecord) {
      throw new Error(foldId ? `\u627E\u4E0D\u5230\u5DF2\u6298\u51FA\u8BB0\u5F55\uFF1A${foldId}` : "\u5F53\u524D\u4F1A\u8BDD\u8FD8\u6CA1\u6709\u5DF2\u6298\u51FA\u7684\u8BB0\u5F55");
    }
    const diskDoc = await readFoldFile(workspaceRoot, session.id, foldRecord.filePath, this.foldDirName);
    const finalTitle = (title ?? diskDoc.parsed.title ?? foldRecord.title).trim() || foldRecord.title;
    const finalSummary = (summary ?? diskDoc.parsed.summary ?? "").trim();
    const finalDetails = (details ?? diskDoc.parsed.details ?? "").trim();
    if (!finalSummary) {
      throw new Error("\u300C\u6CE8\u5165\u4E3B\u7EBF\u7684\u7CBE\u534E\u300D\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A");
    }
    const resyncRes = await commitResyncFold({
      ctx: this.ctx,
      agent,
      session,
      foldRecord,
      title: finalTitle,
      filePath: foldRecord.relativePath || foldRecord.filePath,
      summary: finalSummary
    });
    const updated = await updateFoldFile({
      workspaceRoot,
      sessionId: session.id,
      filePath: foldRecord.filePath,
      foldDirName: this.foldDirName,
      title: finalTitle,
      summary: finalSummary,
      details: finalDetails,
      patchMeta: {
        checkpointSeq: resyncRes.checkpointSeq,
        foldedTokens: resyncRes.foldedTokens
      }
    });
    foldRecord.title = finalTitle;
    foldRecord.checkpointSeq = resyncRes.checkpointSeq;
    foldRecord.foldedTokens = resyncRes.foldedTokens;
    foldRecord.savedTokens = resyncRes.savedTokens;
    foldRecord.updatedAt = updated.updatedAt;
    foldRecord.syncCount = (foldRecord.syncCount ?? 0) + 1;
    await saveSessionState(workspaceRoot, session.id, state, this.foldDirName);
    return {
      fold: foldRecord,
      resync: resyncRes
    };
  }
};
function buildReadonlySessionView(sessionId, header, events) {
  const nodes = [];
  let latestHeader = null;
  for (const ev of events) {
    if (!ev) continue;
    if (ev.type === "request/header" && ev.data?.header) {
      latestHeader = ev.data.header;
    }
    const op = ev.surfaceOp;
    if (op === "append") {
      nodes.push(ev.seq);
    } else if (op && typeof op === "object" && op.op === "replace") {
      const s = nodes.indexOf(op.startSeq);
      const e = nodes.indexOf(op.endSeq);
      if (s !== -1 && e !== -1 && s <= e) {
        nodes.splice(s, e - s + 1, ev.seq);
      }
    }
  }
  return {
    id: sessionId,
    cwd: header?.cwd,
    header,
    log: events,
    surface: { nodes },
    eventAt(seq) {
      return events[seq];
    },
    requestHeader() {
      return latestHeader;
    }
  };
}

// src/host/index.js
var name = PLUGIN_NAME;
var inject = ["sessions"];
function apply(ctx, config = {}) {
  const service = new ContextFoldService(ctx, config);
  ctx.inject(["commands"], (owner) => {
    registerFoldCommands(owner, service);
  });
  ctx.inject(["webServer"], (owner) => {
    registerFoldRoutes(owner, service);
  });
}
export {
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
