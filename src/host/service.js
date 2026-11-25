import { randomUUID } from "node:crypto";
import { DEFAULT_FOLD_DIR_NAME } from "../shared/constants.js";
import { buildCheckpointText, estimateTokens, normalizeTurns } from "../shared/markdown.js";
import { commitInitialFold, commitResyncFold } from "./committer.js";
import { distillRange } from "./distiller.js";
import { inspectSessionTurns, resolveSafeSurfaceSegments } from "./inspector.js";
import {
  loadSessionState,
  readFoldFile,
  saveDraftFile,
  saveSessionState,
  updateFoldFile,
} from "./storage.js";

/**
 * Core orchestration service shared by slash commands and HTTP endpoints.
 */
export class ContextFoldService {
  constructor(ctx, config = {}) {
    this.ctx = ctx;
    this.foldDirName = config.foldDirName || DEFAULT_FOLD_DIR_NAME;
    this.maxDistillTokens = Number(config.maxDistillTokens) || 4096;
  }

  getService(name) {
    if (this.ctx && typeof this.ctx.get === "function") {
      return this.ctx.get(name);
    }
    return this.ctx?.[name];
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
        throw new Error("当前会话没有绑定工作区目录，无法读写折出文件");
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
        throw new Error("该历史会话没有绑定工作区目录，无法读写折出文件");
      }
      const readonlySession = buildReadonlySessionView(sessionId, header, events);
      return { agent: null, session: readonlySession, workspaceRoot, isLive: false };
    }

    throw new Error(`未找到会话 ${sessionId}（请先打开该会话）`);
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
          // Fall through to preset-aware agents.resume below.
        }
      }
    }

    if (!session && agents && typeof agents.resume === "function") {
      try {
        const setup = await this.buildPresetResumeSetup(sessionId);
        const resumed = await agents.resume({
          resumeSessionId: sessionId,
          ...(setup ? { setup } : {}),
        });
        agent = resumed?.agent ?? agents.get?.(sessionId) ?? null;
        session = agent?.session ?? sessions?.get?.(sessionId) ?? null;
      } catch (err) {
        throw new Error(
          `该历史会话尚未激活，自动唤醒失败（${err instanceof Error ? err.message : String(err)}）。你可以先在左侧该会话里随便发一条消息或运行 /fold-apply 激活后再操作。`
        );
      }
    }

    if (!session) {
      throw new Error(`未找到可写入的活跃会话 ${sessionId}（请先在对话框发一条消息或运行 /fold-apply）`);
    }
    const workspaceRoot = session.cwd ?? session.header?.cwd;
    if (!workspaceRoot) {
      throw new Error("当前会话没有绑定工作区目录，无法读写折出文件");
    }
    return { agent, session, workspaceRoot };
  }

  async buildPresetResumeSetup(sessionId) {
    const presets = this.getService("agentPresets");
    const sessionQuery = this.getService("sessionQuery");
    if (!presets || typeof presets.resolve !== "function" || typeof presets.mount !== "function") {
      return undefined;
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
      return undefined;
    }
  }

  async inspect(sessionId, { agent: agentOverride } = {}) {
    const { session, workspaceRoot, isLive } = await this.resolveReadableTarget(sessionId, agentOverride);
    const state = await loadSessionState(workspaceRoot, session.id, this.foldDirName);
    const snapshot = inspectSessionTurns(session, {
      tokenMeter: isLive ? (this.getService("tokenMeter") ?? null) : null,
      folds: state.folds,
      marks: state.marks,
    });
    return {
      ...snapshot,
      isLive,
      drafts: state.drafts,
      foldDirName: this.foldDirName,
    };
  }

  async addMark(sessionId, { agent: agentOverride, label = "", turn } = {}) {
    const { session, workspaceRoot, isLive } = await this.resolveReadableTarget(sessionId, agentOverride);
    const state = await loadSessionState(workspaceRoot, session.id, this.foldDirName);
    const snapshot = inspectSessionTurns(session, {
      tokenMeter: isLive ? (this.getService("tokenMeter") ?? null) : null,
      folds: state.folds,
      marks: state.marks,
    });

    // Default: mark the NEXT turn about to happen (or current turn if explicitly specified).
    const targetTurn =
      turn !== undefined && turn !== null && turn !== ""
        ? Number(turn)
        : snapshot.turnCount + 1;

    if (!Number.isInteger(targetTurn) || targetTurn < 1) {
      throw new Error(`无效的标记轮次：${turn}`);
    }

    const mark = {
      markId: randomUUID().slice(0, 8),
      turn: targetTurn,
      label: String(label ?? "").trim() || `验证起点 #${state.marks.length + 1}`,
      createdAt: new Date().toISOString(),
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
  async prepareFold(
    sessionId,
    { agent: agentOverride, turns, startTurn, endTurn, title = "", signal } = {}
  ) {
    const { agent, session, workspaceRoot, isLive } = await this.resolveReadableTarget(sessionId, agentOverride);
    const state = await loadSessionState(workspaceRoot, session.id, this.foldDirName);

    const selectedTurns = normalizeTurns(turns, startTurn, endTurn);
    const resolved = resolveSafeSurfaceSegments(session, selectedTurns, {
      tokenMeter: isLive ? (this.getService("tokenMeter") ?? null) : null,
      folds: state.folds,
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
      signal,
    });

    const foldId = randomUUID().slice(0, 12);
    const previewCheckpoint = buildCheckpointText({
      foldId,
      title: distilled.title,
      turns: resolved.turns,
      startTurn: resolved.startTurn,
      endTurn: resolved.endTurn,
      filePath: `${this.foldDirName}/${session.id}/...`,
      summary: distilled.summary,
      originalTokens: resolved.originalTokens,
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
      details: distilled.details,
    });

    // Save shadowedSeqs & segments in draft for strict pre-commit stability check.
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
      savedTokens: Math.max(0, resolved.originalTokens - foldedTokens),
    };
  }

  /**
   * Step 2 of two-step fold: apply a draft (with any user edits) to the live session surface.
   */
  async applyFold(
    sessionId,
    { agent: agentOverride, foldId, title, summary, details, sourceCommandId } = {}
  ) {
    const { agent, session, workspaceRoot } = await this.resolveWritableTarget(sessionId, agentOverride);
    const state = await loadSessionState(workspaceRoot, session.id, this.foldDirName);

    const draft = foldId
      ? state.drafts.find((d) => d.foldId === foldId || d.fileName === foldId)
      : state.drafts[state.drafts.length - 1];

    if (!draft) {
      throw new Error(foldId ? `找不到待应用的预览草稿：${foldId}` : "当前没有待应用的预览草稿，请先生成预览");
    }

    // Read latest file from disk (picks up external edits) and apply inline UI edits if provided.
    const diskDoc = await readFoldFile(workspaceRoot, session.id, draft.filePath, this.foldDirName);
    const finalTitle = (title ?? diskDoc.parsed.title ?? draft.title).trim() || draft.title;
    const finalSummary = (summary ?? diskDoc.parsed.summary ?? "").trim();
    const finalDetails = (details ?? diskDoc.parsed.details ?? "").trim();

    if (!finalSummary) {
      throw new Error("「注入主线的精华」内容不能为空，请补充后再确认折出");
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
      model: draft.model ?? "editable-file",
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
        foldedTokens: commitRes.foldedTokens,
      },
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
      syncCount: 0,
    };

    const foldedTurnSet = new Set(draftTurns);
    state.drafts = state.drafts.filter((d) => d.foldId !== draft.foldId);
    state.folds = state.folds.filter((f) => f.foldId !== draft.foldId);
    state.folds.push(foldRecord);
    // Clean up any marks whose turn was actually folded.
    state.marks = state.marks.filter((m) => !foldedTurnSet.has(m.turn));

    await saveSessionState(workspaceRoot, session.id, state, this.foldDirName);

    return {
      fold: foldRecord,
      commit: commitRes,
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
    const rec =
      state.folds.find((f) => f.foldId === foldId || f.fileName === foldId) ??
      state.drafts.find((d) => d.foldId === foldId || d.fileName === foldId);

    if (!rec) {
      throw new Error(`未找到折出记录：${foldId}`);
    }

    const doc = await readFoldFile(workspaceRoot, session.id, rec.filePath, this.foldDirName);
    return {
      record: rec,
      title: doc.parsed.title,
      summary: doc.parsed.summary,
      details: doc.parsed.details,
      raw: doc.raw,
    };
  }

  /**
   * Save edits directly to the Markdown archive file on disk without mutating the live surface.
   * Useful for archived folds that were later merged into a larger compaction.
   */
  async saveDocumentOnly(sessionId, { agent: agentOverride, foldId, title, summary, details } = {}) {
    const { session, workspaceRoot } = await this.resolveReadableTarget(sessionId, agentOverride);
    const state = await loadSessionState(workspaceRoot, session.id, this.foldDirName);
    const rec =
      state.folds.find((f) => f.foldId === foldId || f.fileName === foldId) ??
      state.drafts.find((d) => d.foldId === foldId || d.fileName === foldId);

    if (!rec) {
      throw new Error(`未找到折出记录：${foldId}`);
    }

    const updated = await updateFoldFile({
      workspaceRoot,
      sessionId: session.id,
      filePath: rec.filePath,
      foldDirName: this.foldDirName,
      title: title ?? rec.title,
      summary,
      details,
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

    const foldRecord = foldId
      ? state.folds.find((f) => f.foldId === foldId || f.fileName === foldId)
      : state.folds[state.folds.length - 1];

    if (!foldRecord) {
      throw new Error(foldId ? `找不到已折出记录：${foldId}` : "当前会话还没有已折出的记录");
    }

    const diskDoc = await readFoldFile(workspaceRoot, session.id, foldRecord.filePath, this.foldDirName);
    const finalTitle = (title ?? diskDoc.parsed.title ?? foldRecord.title).trim() || foldRecord.title;
    const finalSummary = (summary ?? diskDoc.parsed.summary ?? "").trim();
    const finalDetails = (details ?? diskDoc.parsed.details ?? "").trim();

    if (!finalSummary) {
      throw new Error("「注入主线的精华」内容不能为空");
    }

    const resyncRes = await commitResyncFold({
      ctx: this.ctx,
      agent,
      session,
      foldRecord,
      title: finalTitle,
      filePath: foldRecord.relativePath || foldRecord.filePath,
      summary: finalSummary,
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
        foldedTokens: resyncRes.foldedTokens,
      },
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
      resync: resyncRes,
    };
  }
}

/**
 * Reconstruct a lightweight read-only Session view from `sessionQuery.readSession()` output
 * by folding `surfaceOp` markers across the persisted event log.
 */
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
    },
  };
}
