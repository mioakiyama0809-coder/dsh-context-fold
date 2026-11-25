import { estimateTokens, groupContiguousTurns, normalizeTurns } from "../shared/markdown.js";

/**
 * Safely read the complete event array from a DSH Session object.
 */
export function readSessionEvents(session) {
  if (Array.isArray(session.log)) return session.log;
  const len = typeof session.logLength === "number" ? session.logLength : 0;
  const out = [];
  for (let i = 0; i < len; i++) {
    const ev = session.eventAt?.(i);
    if (ev !== undefined) out.push(ev);
  }
  return out;
}

/**
 * Extract plain text from a DSH message content array or string.
 */
export function extractTextFromContent(content) {
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

/**
 * Identify synthetic injected user messages (system reminders, runtime snapshots, time ticks)
 * so turn previews show what the human actually typed.
 */
function isSyntheticUserText(text) {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith("<system-reminder>")) return true;
  if (trimmed.startsWith("Current runtime context.")) return true;
  if (trimmed.startsWith("Time sampled while preparing turn")) return true;
  if (trimmed.startsWith("[上下文局部折出")) return true;
  if (trimmed.startsWith("This is an automatically generated checkpoint")) return true;
  return false;
}

/**
 * Compute per-node token counts using DSH's tokenMeter when available,
 * falling back to local heuristic estimation.
 */
export function measureSurfaceNodeTokens(session, tokenMeter) {
  const tokenBySeq = new Map();
  let totalTokens = 0;

  if (tokenMeter && typeof tokenMeter.measure === "function") {
    try {
      const m = tokenMeter.measure(session);
      if (m && Array.isArray(m.nodes)) {
        for (const node of m.nodes) {
          const t = typeof node.tokens === "number" ? node.tokens : (node.heuristicTokens ?? 0);
          tokenBySeq.set(node.seq, t);
          totalTokens += t;
        }
        return { tokenBySeq, totalTokens: typeof m.totalTokens === "number" ? m.totalTokens : totalTokens };
      }
    } catch {
      // Fall back to heuristic measurement below.
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

/**
 * Estimate token cost for a single session event.
 */
export function estimateEventTokens(ev) {
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
        // Reasoning typically isn't re-sent on subsequent turns, give small weight
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
        else if (b?.type === "image") total += 1000;
        else total += estimateTokens(JSON.stringify(b ?? ""));
      }
      return total;
    }
    return estimateTokens(JSON.stringify(content ?? ""));
  }
  return 0;
}

/**
 * Check tool-pairing balance along the current surface.
 * Matches `@deepseek-ai/dsh-compaction` tool-pairing invariants exactly:
 * a safe cut has zero unanswered tool-calls crossing the boundary.
 */
export function computeToolPairingBalance(session) {
  const events = readSessionEvents(session);
  const nodes = session.surface?.nodes ?? [];
  const cutBalanced = [true];
  const indexBySeq = new Map();
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
      if (idx === undefined) return false;
      return cutBalanced[idx] === true;
    },
    balancedAfter(seq) {
      const idx = indexBySeq.get(seq);
      if (idx === undefined) return false;
      return cutBalanced[idx + 1] === true;
    },
  };
}

/**
 * Inspect a session and build the complete Turn Map for the UI & commands.
 */
export function inspectSessionTurns(session, { tokenMeter = null, folds = [], marks = [] } = {}) {
  const events = readSessionEvents(session);
  const surfaceNodes = [...(session.surface?.nodes ?? [])];
  const surfaceSet = new Set(surfaceNodes);
  const { tokenBySeq, totalTokens } = measureSurfaceNodeTokens(session, tokenMeter);

  const foldByTurn = new Map();
  for (const fold of folds) {
    const foldTurns = normalizeTurns(fold.turns, fold.startTurn, fold.endTurn);
    for (const t of foldTurns) {
      foldByTurn.set(t, fold);
    }
  }

  const markByTurn = new Map();
  for (const m of marks) {
    markByTurn.set(m.turn, m);
  }

  // Group events into turns based on `turn/start`.
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
        markLabel: markByTurn.get(turnNumber)?.label ?? null,
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

  // Determine per-turn status and attach fold info.
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

  // Enrich folds with live surface status (whether checkpointSeq is still active in surface).
  const enrichedFolds = folds.map((f) => {
    const activeInSurface =
      typeof f.checkpointSeq === "number" && surfaceSet.has(f.checkpointSeq);
    const liveTokens = activeInSurface ? (tokenBySeq.get(f.checkpointSeq) ?? f.foldedTokens ?? 0) : 0;
    return {
      ...f,
      activeInSurface,
      liveTokens,
    };
  });

  // Check if session currently has an open turn (not idle).
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
    marks,
  };
}

/**
 * Resolve a user-selected turn range [startTurn..endTurn] into a validated,
 * contiguous, tool-pairing-balanced surface seq range `{ startSeq, endSeq, shadowedSeqs }`.
 */
export function resolveSafeSurfaceRange(session, startTurn, endTurn, { tokenMeter = null, folds = [] } = {}) {
  const sTurn = Number(startTurn);
  const eTurn = Number(endTurn);
  if (!Number.isInteger(sTurn) || !Number.isInteger(eTurn) || sTurn < 1 || eTurn < sTurn) {
    throw new Error(`轮次区间无效：${startTurn}-${endTurn}（需要 startTurn >= 1 且 endTurn >= startTurn）`);
  }

  const inspection = inspectSessionTurns(session, { tokenMeter, folds });
  if (eTurn > inspection.turnCount) {
    throw new Error(`结束轮次 ${eTurn} 超出当前总轮次 ${inspection.turnCount}`);
  }

  const events = readSessionEvents(session);
  const balance = computeToolPairingBalance(session);
  const nodes = balance.nodes;
  const { tokenBySeq } = measureSurfaceNodeTokens(session, tokenMeter);

  const selectedTurns = inspection.turns.filter((t) => t.turn >= sTurn && t.turn <= eTurn);
  // Collect all active surface seqs in these turns, plus any existing fold checkpoints whose turn ranges sit inside [sTurn..eTurn].
  const targetSeqSet = new Set();
  for (const t of selectedTurns) {
    for (const seq of t.activeSurfaceSeqs) {
      targetSeqSet.add(seq);
    }
  }
  for (const f of folds) {
    if (
      f.startTurn >= sTurn &&
      f.endTurn <= eTurn &&
      typeof f.checkpointSeq === "number" &&
      balance.indexBySeq.has(f.checkpointSeq)
    ) {
      targetSeqSet.add(f.checkpointSeq);
    }
  }

  if (targetSeqSet.size === 0) {
    throw new Error(`第 ${sTurn}–${eTurn} 轮在当前模型上下文中已无活跃内容（可能已被折出或压缩）`);
  }

  // Find min/max surface indices among targetSeqSet.
  let minIdx = Infinity;
  let maxIdx = -1;
  for (const seq of targetSeqSet) {
    const idx = balance.indexBySeq.get(seq);
    if (idx !== undefined) {
      if (idx < minIdx) minIdx = idx;
      if (idx > maxIdx) maxIdx = idx;
    }
  }

  // Protect surface node 0 if it is the system prompt.
  if (minIdx === 0 && events[nodes[0]]?.type === "system/message") {
    minIdx = 1;
  }

  if (minIdx > maxIdx) {
    throw new Error(`第 ${sTurn}–${eTurn} 轮无可替换的非系统消息`);
  }

  // Expand boundaries outward slightly if needed to reach tool-pairing balance.
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
    throw new Error(`起始位置 seq=${startSeq} 处于未闭合的工具调用中间，无法安全切分`);
  }
  if (!balance.balancedAfter(endSeq)) {
    throw new Error(`结束位置 seq=${endSeq} 处于未闭合的工具调用中间（可能对话尚未结束），无法安全切分`);
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
    originalTokens,
  };
}

/**
 * Resolve an arbitrary (possibly non-contiguous) list of selected turn numbers
 * into validated, disjoint, tool-pairing-balanced contiguous surface segments.
 * Unselected turns in between remain 100% untouched on the surface.
 */
export function resolveSafeSurfaceSegments(session, turns, { tokenMeter = null, folds = [] } = {}) {
  const normalized = normalizeTurns(turns);
  if (normalized.length === 0) {
    throw new Error("请至少选择一轮需要折出的对话");
  }

  const groups = groupContiguousTurns(normalized);
  const segments = [];
  const allShadowedSeqs = [];
  let totalOriginalTokens = 0;

  for (const g of groups) {
    const seg = resolveSafeSurfaceRange(session, g.startTurn, g.endTurn, { tokenMeter, folds });
    // Ensure disjoint segments don't accidentally overlap due to tool-pairing expansion.
    if (segments.length > 0) {
      const prev = segments[segments.length - 1];
      if (seg.startSeq <= prev.endSeq) {
        // Merge overlapping expanded segments cleanly
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
    originalTokens: totalOriginalTokens,
  };
}

/**
 * Extract a clean, bounded transcript + deterministic facts from a shadowed seq range
 * for LLM distillation (or deterministic fallback).
 */
export function extractRangeTranscript(session, shadowedSeqs, { maxChars = 48000 } = {}) {
  const events = readSessionEvents(session);
  const lines = [];
  const filesTouched = new Set();
  const toolsUsed = new Map();
  const errors = [];
  const userHighlights = [];
  const assistantHighlights = [];

  for (const seq of shadowedSeqs) {
    const ev = events[seq];
    if (!ev) continue;

    if (ev.type === "user/message") {
      const txt = extractTextFromContent(ev.data?.content).trim();
      if (!txt) continue;
      if (isSyntheticUserText(txt) && !txt.startsWith("[上下文局部折出")) continue;
      const clipped = clipText(txt, 2500);
      lines.push(`[USER seq=${seq}]\n${clipped}`);
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
        lines.push(`[ASSISTANT seq=${seq}]\n${clipText(joined, 3500)}`);
        assistantHighlights.push(collapseWhitespace(joined).slice(0, 220));
      }
    } else if (ev.type === "tool/result") {
      const msg = ev.data?.message ?? {};
      const isErr = msg.isError === true;
      const rawContent =
        typeof msg.content === "string"
          ? msg.content
          : Array.isArray(msg.content)
            ? extractTextFromContent(msg.content)
            : JSON.stringify(msg.content ?? "");
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
    transcript = `${head}\n\n... [中间过程已按长度截断，共省略 ${transcript.length - head.length - tail.length} 字符] ...\n\n${tail}`;
  }

  return {
    transcript,
    facts: {
      filesTouched: [...filesTouched].slice(0, 30),
      toolsUsed: [...toolsUsed.entries()].map(([name, count]) => `${name}×${count}`),
      errors: errors.slice(0, 10),
      userHighlights,
      assistantHighlights: assistantHighlights.slice(-6),
    },
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
  return `${str.slice(0, max)}…(已截断，原长 ${str.length} 字)`;
}

function collapseWhitespace(str) {
  return String(str ?? "").replace(/\s+/g, " ").trim();
}
