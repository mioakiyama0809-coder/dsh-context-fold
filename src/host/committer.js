import { randomUUID } from "node:crypto";
import { buildCheckpointText, buildSegmentStubText, estimateTokens, normalizeTurns } from "../shared/markdown.js";
import { computeToolPairingBalance, readSessionEvents } from "./inspector.js";

/**
 * Check whether the session currently has an open turn or active compaction lock.
 */
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

  const compactionLocked =
    unmatchedCompactionStart !== null && latestEndSeedSeq <= unmatchedCompactionStart.seq;

  return { openTurn, compactionLocked };
}

/**
 * Execute an exclusive maintenance action on an idle agent when supported,
 * or run directly against the session in unit/mock environments.
 */
async function withMaintenance(agent, fn) {
  if (agent && typeof agent.runMaintenance === "function") {
    return await agent.runMaintenance(async (agentSignal) => fn(agentSignal));
  }
  return await fn(undefined);
}

/**
 * Commit an initial selective range fold onto the session surface using DSH's
 * native `compaction/start -> compaction/summary -> user/message(replace) -> compaction/end`
 * transaction, followed by `ctx.sessions.flush(session)`.
 */
export async function commitInitialFold({
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
  model = "editable-file",
}) {
  const targetSession = session ?? agent?.session;
  if (!targetSession) throw new Error("无法找到目标会话实例");

  const resolvedSegments =
    Array.isArray(segments) && segments.length > 0
      ? segments
      : [
          {
            startTurn,
            endTurn,
            startSeq,
            endSeq,
            shadowedSeqs: expectedShadowedSeqs,
            originalTokens,
          },
        ];

  const resolvedTurns = normalizeTurns(turns, startTurn, endTurn);

  return await withMaintenance(agent, async () => {
    const lock = inspectLockState(targetSession);
    if (lock.openTurn) {
      throw new Error("当前会话正在运行中，请等这一轮回复结束后再执行折出");
    }
    if (lock.compactionLocked) {
      throw new Error("当前会话正在执行压缩，请稍后再试");
    }

    // Pre-validate EVERY segment atomically before mutating anything!
    const initialBalance = computeToolPairingBalance(targetSession);
    const validatedSegments = [];
    for (const seg of resolvedSegments) {
      const sIdx = initialBalance.indexBySeq.get(seg.startSeq);
      const eIdx = initialBalance.indexBySeq.get(seg.endSeq);
      if (sIdx === undefined || eIdx === undefined || sIdx > eIdx) {
        throw new Error(
          `目标区间 seq ${seg.startSeq}..${seg.endSeq} 在当前上下文中已发生变化，请重新生成预览`
        );
      }
      if (!initialBalance.balancedBefore(seg.startSeq) || !initialBalance.balancedAfter(seg.endSeq)) {
        throw new Error(`目标区间 seq ${seg.startSeq}..${seg.endSeq} 边界未对齐工具调用对，已中止替换`);
      }
      const liveShadowed = initialBalance.nodes.slice(sIdx, eIdx + 1);
      if (Array.isArray(seg.shadowedSeqs)) {
        const same =
          seg.shadowedSeqs.length === liveShadowed.length &&
          seg.shadowedSeqs.every((seq, i) => seq === liveShadowed[i]);
        if (!same) {
          throw new Error("预览期间选中区间的内容发生了变化，请刷新后重试");
        }
      }
      validatedSegments.push({ ...seg, liveShadowed });
    }

    const totalOriginal =
      typeof originalTokens === "number" && originalTokens > 0
        ? originalTokens
        : validatedSegments.reduce((acc, s) => acc + (s.originalTokens ?? 0), 0);

    const segmentResults = [];
    let totalFoldedTokens = 0;

    for (let i = 0; i < validatedSegments.length; i++) {
      const seg = validatedSegments[i];
      const isPrimary = i === validatedSegments.length - 1;

      const text = isPrimary
        ? buildCheckpointText({
            foldId,
            title,
            turns: resolvedTurns,
            startTurn: resolvedTurns[0] ?? startTurn,
            endTurn: resolvedTurns[resolvedTurns.length - 1] ?? endTurn,
            filePath,
            summary,
            originalTokens: totalOriginal,
          })
        : buildSegmentStubText({
            foldId,
            title,
            startTurn: seg.startTurn,
            endTurn: seg.endTurn,
            filePath,
          });

      const segFoldedTokens = estimateTokens(text);
      totalFoldedTokens += segFoldedTokens;

      const compactionId = randomUUID();
      const lifecycle = {
        compactionId,
        ...(isPrimary && sourceCommandId !== undefined ? { sourceCommandId } : {}),
        turn: null,
      };

      const startEvent = targetSession.append("compaction/start", lifecycle);
      let closed = false;
      try {
        const summaryEvent = targetSession.append("compaction/summary", {
          compactionId,
          ...(isPrimary && sourceCommandId !== undefined ? { sourceCommandId } : {}),
          summary: [{ type: "text", text }],
          shadowedRange: { start: seg.startSeq, end: seg.endSeq },
          shadowedSeqs: [...seg.liveShadowed],
          shadowedTokenCount: seg.originalTokens ?? totalOriginal,
          provider,
          model,
        });

        const checkpointMessage = {
          id: randomUUID(),
          role: "user",
          content: [{ type: "text", text }],
          source: {
            kind: "compact-checkpoint",
            compactionId,
            ...(isPrimary && sourceCommandId !== undefined ? { sourceCommandId } : {}),
          },
        };

        const checkpointEvent = targetSession.append("user/message", checkpointMessage, {
          surfaceOp: {
            op: "replace",
            startSeq: seg.startSeq,
            endSeq: seg.endSeq,
          },
          sourceEventSeqs: [startEvent.seq, summaryEvent.seq, ...seg.liveShadowed],
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
          foldedTokens: segFoldedTokens,
        });
      } catch (err) {
        if (!closed) {
          try {
            targetSession.append("compaction/end", {
              ...lifecycle,
              error: { message: err instanceof Error ? err.message : String(err) },
            });
          } catch {
            // Best-effort close.
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
        endTurn: r.endTurn,
      })),
      shadowedSeqs: allShadowed,
      originalTokens: totalOriginal,
      foldedTokens: totalFoldedTokens,
      savedTokens: Math.max(0, totalOriginal - totalFoldedTokens),
    };
  });
}

/**
 * Re-sync an already-folded editable Markdown file into the live session surface
 * by replacing the previous checkpoint node in-place (`startSeq === endSeq === prevCheckpointSeq`).
 * Never spams chat UI with duplicate compaction rows.
 */
export async function commitResyncFold({
  ctx,
  agent,
  session,
  foldRecord,
  title,
  filePath,
  summary,
}) {
  const targetSession = session ?? agent?.session;
  if (!targetSession) throw new Error("无法找到目标会话实例");

  const prevSeq = foldRecord.checkpointSeq;
  if (typeof prevSeq !== "number") {
    throw new Error("该记录尚未应用到上下文，无法同步；请先执行应用折出");
  }

  return await withMaintenance(agent, async () => {
    const lock = inspectLockState(targetSession);
    if (lock.openTurn) {
      throw new Error("当前会话正在运行中，请等这一轮回复结束后再同步修改");
    }
    if (lock.compactionLocked) {
      throw new Error("当前会话正在执行压缩，请稍后再试");
    }

    const balance = computeToolPairingBalance(targetSession);
    if (!balance.indexBySeq.has(prevSeq)) {
      throw new Error(
        `原折出节点 seq=${prevSeq} 已不在当前模型上下文中（可能已被后续更大范围的压缩合并），无法原地同步`
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
      originalTokens: foldRecord.originalTokens ?? 0,
    });
    const foldedTokens = estimateTokens(checkpointText);

    // Use a producer-owned source kind (not "compact-checkpoint" and not "plugin")
    // so DSH v4 persistence validation admits in-place re-syncs without requiring
    // a new compaction/start..compaction/end transaction or adding chat noise.
    const updatedMessage = {
      id: randomUUID(),
      role: "user",
      content: [{ type: "text", text: checkpointText }],
      source: {
        kind: "context-fold-sync",
        foldId: foldRecord.foldId,
      },
    };

    const newEvent = targetSession.append("user/message", updatedMessage, {
      surfaceOp: {
        op: "replace",
        startSeq: prevSeq,
        endSeq: prevSeq,
      },
      sourceEventSeqs: [prevSeq],
    });

    const sessions = ctx?.get?.("sessions") ?? ctx?.sessions;
    if (sessions && typeof sessions.flush === "function") {
      await sessions.flush(targetSession);
    }

    return {
      previousCheckpointSeq: prevSeq,
      checkpointSeq: newEvent.seq,
      foldedTokens,
      savedTokens: Math.max(0, (foldRecord.originalTokens ?? 0) - foldedTokens),
    };
  });
}
