import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  estimateTokens,
  formatTurnLabel,
  formatTurnRangeChinese,
  groupContiguousTurns,
  normalizeTurns,
} from "../shared/markdown.js";
import {
  addMark,
  applyFold,
  discardDraft,
  fetchDocument,
  fetchState,
  prepareFold,
  removeMark,
  saveDocumentOnly,
  syncFold,
} from "./api.js";
import { RunningBorder, useStreamlineFlights } from "./motion.jsx";
import { ensureStyles } from "./styles.js";

function formatCompact(n) {
  const num = Number(n ?? 0);
  if (num >= 10000) return `${(num / 1000).toFixed(1)}k`;
  return num.toLocaleString("en-US");
}

function cleanFileLabel(record) {
  const name = record?.fileName || String(record?.relativePath ?? "").split("/").pop() || "";
  return name.replace(/-[a-f0-9]{6}\.md$/i, ".md");
}

function toFileResourceUri(sessionId, relativePath) {
  const norm = String(relativePath ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  const encodedPath = norm
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `dsh-resource://file/session/${encodeURIComponent(sessionId)}/${encodedPath}`;
}

function IconRefresh({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

function IconBookmark({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconFile({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  );
}

function IconSync({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 0 1 15.36-6.36L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.36 6.36L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

function IconChevron({ open, size = 13 }) {
  return (
    <svg className="dcf-chevron" data-open={open} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function IconCheck({ size = 10 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function FoldPanel({ useTabInfo, sessionId }) {
  ensureStyles();
  const tabInfo = typeof useTabInfo === "function" ? useTabInfo() : null;
  const tabActions = tabInfo?.tab?.actions;

  const { launchFlight, FlightOverlay } = useStreamlineFlights();
  const activeMetricRef = useRef(null);
  const archivesTabRef = useRef(null);
  const editorTabRef = useRef(null);
  const primaryActionRef = useRef(null);
  const lastClickedTurnRef = useRef(null);

  const [view, setView] = useState("map"); // "map" | "archives" | "editor"
  const [snap, setSnap] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Non-contiguous multi-turn selection state
  const [selectedTurns, setSelectedTurns] = useState([]);
  const [foldTitle, setFoldTitle] = useState("");

  // Mark input
  const [showMarkBox, setShowMarkBox] = useState(false);
  const [markLabel, setMarkLabel] = useState("");

  // Editor state
  const [editorMode, setEditorMode] = useState("draft"); // "draft" | "fold"
  const [editingRecord, setEditingRecord] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editDetails, setEditDetails] = useState("");
  const [showDetails, setShowDetails] = useState(false);

  const reload = useCallback(
    async ({ silent = false } = {}) => {
      if (!sessionId) return;
      if (!silent) {
        setLoading(true);
        setError("");
      }
      try {
        const data = await fetchState(sessionId);
        setSnap(data);
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [sessionId]
  );

  // Reset per-session UI state whenever the user switches conversations.
  useEffect(() => {
    setView("map");
    setSelectedTurns([]);
    lastClickedTurnRef.current = null;
    setFoldTitle("");
    setShowMarkBox(false);
    setMarkLabel("");
    setEditingRecord(null);
    setEditTitle("");
    setEditSummary("");
    setEditDetails("");
    setShowDetails(false);
    setError("");
    setNotice("");
    void reload();
  }, [sessionId, reload]);

  // Auto-poll gently while the agent is still generating.
  useEffect(() => {
    if (!sessionId || !snap || snap.isIdle) return;
    const timer = setInterval(() => {
      void reload({ silent: true });
    }, 2500);
    return () => clearInterval(timer);
  }, [sessionId, snap?.isIdle, reload]);

  useEffect(() => {
    if (!tabActions?.bindCommands) return;
    return tabActions.bindCommands({
      refresh: () => {
        void reload();
      },
    });
  }, [tabActions, reload]);

  const maxTurnTokens = useMemo(() => {
    if (!snap?.turns?.length) return 1;
    return Math.max(1, ...snap.turns.map((t) => t.activeTokens || 0));
  }, [snap]);

  const totalSavedTokens = useMemo(() => {
    if (!snap?.folds?.length) return 0;
    return snap.folds.reduce((acc, f) => acc + Math.max(0, f.savedTokens || 0), 0);
  }, [snap]);

  const selectedTurnSet = useMemo(() => new Set(selectedTurns), [selectedTurns]);

  const selectedStats = useMemo(() => {
    if (!snap || selectedTurns.length === 0) return null;
    const activeTurnNums = [];
    let tokens = 0;
    for (const t of snap.turns) {
      if (selectedTurnSet.has(t.turn) && t.status === "active") {
        activeTurnNums.push(t.turn);
        tokens += t.activeTokens || 0;
      }
    }
    if (activeTurnNums.length === 0) return null;
    const segments = groupContiguousTurns(activeTurnNums);
    return {
      turns: activeTurnNums,
      label: formatTurnLabel(activeTurnNums),
      segmentCount: segments.length,
      tokens,
      activeTurns: activeTurnNums.length,
    };
  }, [snap, selectedTurns, selectedTurnSet]);

  const openEditorForRecord = useCallback(
    async (record, mode) => {
      setBusy(true);
      setError("");
      setNotice("");
      try {
        const doc = await fetchDocument(sessionId, record.foldId);
        setEditorMode(mode);
        setEditingRecord(doc.record);
        setEditTitle(doc.title);
        setEditSummary(doc.summary);
        setEditDetails(doc.details);
        setShowDetails(false);
        setView("editor");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [sessionId]
  );

  // Normal click: toggle single turn freely (non-contiguous multi-select).
  // Shift + click: select contiguous span from last clicked turn to this turn.
  const handleTurnClick = (turnObj, event) => {
    if (turnObj.status === "folded") {
      if (turnObj.foldId && snap?.folds) {
        const matched = snap.folds.find((f) => f.foldId === turnObj.foldId);
        if (matched) void openEditorForRecord(matched, "fold");
      }
      return;
    }

    const t = turnObj.turn;
    const shift = Boolean(event?.shiftKey);
    const anchor = lastClickedTurnRef.current;

    if (shift && anchor !== null && snap?.turns) {
      const lo = Math.min(anchor, t);
      const hi = Math.max(anchor, t);
      const activeInSpan = snap.turns
        .filter((item) => item.turn >= lo && item.turn <= hi && item.status === "active")
        .map((item) => item.turn);
      setSelectedTurns((prev) => normalizeTurns([...prev, ...activeInSpan]));
    } else {
      setSelectedTurns((prev) => {
        if (prev.includes(t)) {
          return prev.filter((n) => n !== t);
        }
        return normalizeTurns([...prev, t]);
      });
    }
    lastClickedTurnRef.current = t;
  };

  const handleAddMark = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const m = await addMark(sessionId, { label: markLabel });
      setMarkLabel("");
      setShowMarkBox(false);
      setNotice(`已打起点标记「${m.label}」（第 ${m.turn} 轮）`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSelectMarkRange = (mark) => {
    if (!snap || mark.turn > snap.turnCount) {
      setNotice(`标记起点在第 ${mark.turn} 轮，等验证对话开始后再选即可。`);
      return;
    }
    const activeInMark = snap.turns
      .filter((item) => item.turn >= mark.turn && item.turn <= snap.turnCount && item.status === "active")
      .map((item) => item.turn);
    setSelectedTurns(activeInMark);
    lastClickedTurnRef.current = mark.turn;
    setFoldTitle(mark.label || "");
  };

  const handlePrepare = async () => {
    if (!selectedStats) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await prepareFold(sessionId, {
        turns: selectedStats.turns,
        title: foldTitle.trim(),
      });
      setEditorMode("draft");
      setEditingRecord(res.draft);
      setEditTitle(res.title);
      setEditSummary(res.summary);
      setEditDetails(res.details);
      setShowDetails(false);
      setView("editor");
      setNotice("预览已生成：微调精华后点击下方「确认折出」即可替换上下文。");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const fireFoldFlight = () => {
    const fromEl = primaryActionRef.current;
    const toArchive = archivesTabRef.current;
    const toMetric = activeMetricRef.current;
    if (fromEl && toArchive) {
      launchFlight({ fromEl, toEl: toArchive, color: "#4d6bfe", seed: 0.28 });
    }
    if (fromEl && toMetric) {
      launchFlight({ fromEl, toEl: toMetric, color: "#0d9488", seed: 0.72 });
    }
  };

  const fireSyncFlight = (originEl) => {
    const fromEl = originEl ?? primaryActionRef.current;
    const toMetric = activeMetricRef.current;
    if (fromEl && toMetric) {
      launchFlight({ fromEl, toEl: toMetric, color: "#0d9488", seed: 0.65 });
    }
    // Also send a restrained streamline left toward the active conversation column
    if (fromEl && typeof window !== "undefined") {
      const r = fromEl.getBoundingClientRect();
      if (r.left > 240) {
        launchFlight({
          fromEl,
          toPoint: { x: Math.max(120, r.left - 180), y: Math.max(96, r.top - 120) },
          color: "#4d6bfe",
          seed: 0.22,
        });
      }
    }
  };

  const handleApplyDraft = async () => {
    if (!editingRecord) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await applyFold(sessionId, {
        foldId: editingRecord.foldId,
        title: editTitle,
        summary: editSummary,
        details: editDetails,
      });
      fireFoldFlight();
      setSelectedTurns([]);
      lastClickedTurnRef.current = null;
      setFoldTitle("");
      setEditingRecord({ ...res.fold, activeInSurface: true });
      setEditorMode("fold");
      setView("archives");
      const rangeCn = formatTurnRangeChinese(res.fold.turns, res.fold.startTurn, res.fold.endTurn);
      setNotice(
        `${rangeCn}已折出，节省约 ${formatCompact(res.commit.savedTokens)} tok。`
      );
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDiscardDraft = async (foldId) => {
    setBusy(true);
    setError("");
    try {
      await discardDraft(sessionId, foldId);
      if (editingRecord?.foldId === foldId) {
        setEditingRecord(null);
        setView("map");
      }
      setNotice("已丢弃未应用的草稿。");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSyncFold = async () => {
    if (!editingRecord) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await syncFold(sessionId, {
        foldId: editingRecord.foldId,
        title: editTitle,
        summary: editSummary,
        details: editDetails,
      });
      fireSyncFlight(primaryActionRef.current);
      setEditingRecord({ ...res.fold, activeInSurface: true });
      setNotice(
        `已原地同步（第 ${res.fold.syncCount} 次 · 约 ${formatCompact(res.resync.foldedTokens)} tok）。`
      );
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleQuickDiskSync = async (foldRecord, event) => {
    const btnEl = event?.currentTarget ?? null;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await syncFold(sessionId, { foldId: foldRecord.foldId });
      fireSyncFlight(btnEl);
      setNotice(
        `已从磁盘同步「${res.fold.title}」（约 ${formatCompact(res.resync.foldedTokens)} tok）。`
      );
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveFileOnly = async () => {
    if (!editingRecord) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await saveDocumentOnly(sessionId, {
        foldId: editingRecord.foldId,
        title: editTitle,
        summary: editSummary,
        details: editDetails,
      });
      setEditingRecord({ ...editingRecord, ...res.record });
      setNotice(`已保存档案「${res.record.title}」到磁盘。`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const editingLiveFold = useMemo(() => {
    if (!editingRecord || !snap?.folds) return null;
    return snap.folds.find((f) => f.foldId === editingRecord.foldId) ?? null;
  }, [editingRecord, snap]);

  const isEditingActiveInSurface =
    editorMode === "draft" ? true : (editingLiveFold?.activeInSurface ?? editingRecord?.activeInSurface ?? true);

  const handleOpenExternalFile = (record) => {
    if (!tabActions?.openResource || !record?.relativePath) return;
    try {
      tabActions.openResource(toFileResourceUri(sessionId, record.relativePath));
    } catch {
      setNotice(`档案路径：${record.relativePath}`);
    }
  };

  if (!sessionId) {
    return (
      <div className="dcf-root">
        <div className="dcf-empty">请先在左侧选择一个会话</div>
      </div>
    );
  }

  const archiveCount = (snap?.folds?.length ?? 0) + (snap?.drafts?.length ?? 0);

  return (
    <div className="dcf-root">
      {FlightOverlay}

      <div className="dcf-header">
        <div className="dcf-header-top">
          <div className="dcf-header-metrics" ref={activeMetricRef}>
            <span className="dcf-metric" title="当前模型上下文中的消息估算 Token">
              活跃 <strong>{formatCompact(snap?.totalSurfaceTokens ?? 0)}</strong> tok
            </span>
            {totalSavedTokens > 0 && (
              <>
                <span className="dcf-metric-dot">·</span>
                <span className="dcf-metric dcf-metric-saved" title="本会话累计折出节省的 Token">
                  已省 {formatCompact(totalSavedTokens)}
                </span>
              </>
            )}
            {snap && !snap.isIdle && (
              <>
                <span className="dcf-metric-dot">·</span>
                <span className="dcf-metric-warn">生成中…</span>
              </>
            )}
          </div>
          <div className="dcf-header-actions">
            <button
              type="button"
              className="dcf-btn dcf-btn-ghost"
              disabled={busy}
              onClick={() => setShowMarkBox((v) => !v)}
              title="在开始验证前打一个起点标记，验完一键选中整段"
            >
              <IconBookmark />
              <span>标记</span>
            </button>
            <button
              type="button"
              className="dcf-btn dcf-btn-icon"
              disabled={loading || busy}
              onClick={() => void reload()}
              title="刷新轮次地图"
              aria-label="刷新"
            >
              <IconRefresh />
            </button>
          </div>
        </div>

        {showMarkBox && (
          <div className="dcf-row">
            <input
              className="dcf-input"
              style={{ flex: 1 }}
              placeholder="输入验证主题（如：某股龙虎榜复盘）"
              value={markLabel}
              onChange={(e) => setMarkLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAddMark();
              }}
            />
            <button
              type="button"
              className="dcf-btn dcf-btn-primary"
              disabled={busy}
              onClick={() => void handleAddMark()}
            >
              打标记
            </button>
          </div>
        )}
      </div>

      <div className="dcf-tabs">
        <button
          type="button"
          className="dcf-tab"
          data-active={view === "map"}
          onClick={() => setView("map")}
        >
          <span>轮次地图</span>
          <span className="dcf-tab-count">{snap?.turnCount ?? 0}</span>
        </button>
        <button
          ref={archivesTabRef}
          type="button"
          className="dcf-tab"
          data-active={view === "archives"}
          onClick={() => setView("archives")}
        >
          <span>折出档案</span>
          <span className="dcf-tab-count">{archiveCount}</span>
        </button>
        {editingRecord && (
          <button
            ref={editorTabRef}
            type="button"
            className="dcf-tab"
            data-active={view === "editor"}
            onClick={() => setView("editor")}
          >
            <span>{editorMode === "draft" ? "预览确认" : "编辑同步"}</span>
          </button>
        )}
      </div>

      <div className="dcf-body">
        {error && (
          <div className="dcf-banner dcf-banner-error">
            <span className="dcf-banner-text">{error}</span>
            <button type="button" className="dcf-banner-close" onClick={() => setError("")} aria-label="关闭">
              ×
            </button>
          </div>
        )}
        {notice && (
          <div className="dcf-banner dcf-banner-ok">
            <span className="dcf-banner-text">{notice}</span>
            <button type="button" className="dcf-banner-close" onClick={() => setNotice("")} aria-label="关闭">
              ×
            </button>
          </div>
        )}

        {view === "map" && (
          <>
            {snap?.marks?.length > 0 && (
              <div className="dcf-row" style={{ padding: "2px 0 4px" }}>
                {snap.marks.map((m) => (
                  <span key={m.markId} className="dcf-row" style={{ gap: 2 }}>
                    <button
                      type="button"
                      className="dcf-btn dcf-btn-soft"
                      style={{ padding: "3px 8px", fontSize: 11.5 }}
                      onClick={() => handleSelectMarkRange(m)}
                    >
                      <IconBookmark size={11} />
                      <span>T{m.turn} 起 · {m.label}</span>
                    </button>
                    <button
                      type="button"
                      className="dcf-btn dcf-btn-ghost"
                      style={{ padding: "2px 5px" }}
                      title="移除标记"
                      onClick={() => void removeMark(sessionId, m.markId).then(() => reload())}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {snap?.turns?.length > 0 && (
              <div className="dcf-turn-head" style={{ padding: "0 2px 2px" }}>
                <span className="dcf-hint">单击自由多选（可跨轮跳过中间）· Shift 点击连选区间</span>
              </div>
            )}

            {snap?.turns?.length === 0 && (
              <div className="dcf-empty">当前会话还没有对话轮次</div>
            )}

            {snap?.turns?.map((t) => {
              const isSelected = t.status === "active" && selectedTurnSet.has(t.turn);
              const ratio = Math.min(100, Math.round(((t.activeTokens || 0) / maxTurnTokens) * 100));
              const heavy = (t.activeTokens || 0) >= 6000;

              return (
                <div
                  key={t.turn}
                  className="dcf-turn"
                  data-selected={isSelected}
                  data-folded={t.status === "folded"}
                  data-heavy={heavy}
                  onClick={(e) => handleTurnClick(t, e)}
                  title={
                    t.status === "folded"
                      ? "点击查看/编辑对应的折出档案"
                      : "单击单独选中/取消，按住 Shift 点击可连选区间"
                  }
                >
                  <div className="dcf-turn-head">
                    <div className="dcf-turn-left">
                      {t.status === "active" && (
                        <span className="dcf-check" data-checked={isSelected} aria-hidden="true">
                          {isSelected && <IconCheck />}
                        </span>
                      )}
                      <span className="dcf-turn-num">T{t.turn}</span>
                      {t.markLabel && <span className="dcf-tag dcf-tag-mark">{t.markLabel}</span>}
                      {t.toolCallCount > 0 && (
                        <span className="dcf-tag">{t.toolCallCount} 工具</span>
                      )}
                    </div>
                    {t.status === "folded" ? (
                      <span className="dcf-tag dcf-tag-saved">
                        已折出{t.foldTitle ? ` · ${t.foldTitle}` : ""}
                      </span>
                    ) : (
                      <span className={`dcf-tag ${heavy ? "dcf-tag-warn" : ""}`}>
                        {formatCompact(t.activeTokens)} tok
                      </span>
                    )}
                  </div>
                  <div className="dcf-turn-preview">
                    {t.promptPreview || t.responsePreview || "(系统/工具轮)"}
                  </div>
                  {t.status === "active" && (
                    <div className="dcf-bar-track">
                      <div
                        className="dcf-bar-fill"
                        data-heavy={heavy}
                        style={{ width: `${Math.max(3, ratio)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {view === "archives" && (
          <>
            {snap?.drafts?.length > 0 && (
              <>
                <div className="dcf-section-title">待确认草稿</div>
                {snap.drafts.map((d) => (
                  <div key={d.foldId} className="dcf-card">
                    <div className="dcf-turn-head">
                      <span className="dcf-card-title">{d.title}</span>
                      <span className="dcf-tag dcf-tag-warn">待确认</span>
                    </div>
                    <div className="dcf-meta-line">
                      <span>{formatTurnLabel(d.turns, { fallbackStart: d.startTurn, fallbackEnd: d.endTurn })}</span>
                      <span>·</span>
                      <span>
                        {formatCompact(d.originalTokens)} → {formatCompact(d.foldedTokens)} tok
                      </span>
                    </div>
                    <div className="dcf-file-chip" title={d.relativePath}>
                      {cleanFileLabel(d)}
                    </div>
                    <div className="dcf-row" style={{ marginTop: 2 }}>
                      <button
                        type="button"
                        className="dcf-btn dcf-btn-primary"
                        disabled={busy}
                        onClick={() => void openEditorForRecord(d, "draft")}
                      >
                        审阅并确认
                      </button>
                      <button
                        type="button"
                        className="dcf-btn dcf-btn-danger"
                        disabled={busy}
                        onClick={() => void handleDiscardDraft(d.foldId)}
                      >
                        丢弃
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}

            <div className="dcf-section-title">已折出档案</div>
            {(!snap?.folds || snap.folds.length === 0) && (
              <div className="dcf-empty">
                还没有已折出的段落<br />
                在「轮次地图」中勾选任意一轮或多轮即可折出
              </div>
            )}
            {snap?.folds?.map((f) => (
              <div key={f.foldId} className="dcf-card">
                <div className="dcf-turn-head">
                  <span className="dcf-card-title">{f.title}</span>
                  <span className="dcf-tag dcf-tag-saved">
                    -{formatCompact(f.savedTokens)} tok
                  </span>
                </div>
                <div className="dcf-meta-line">
                  <span>{formatTurnLabel(f.turns, { fallbackStart: f.startTurn, fallbackEnd: f.endTurn })}</span>
                  <span>·</span>
                  <span>
                    {formatCompact(f.originalTokens)} → {formatCompact(f.liveTokens || f.foldedTokens)} tok
                  </span>
                  {f.syncCount > 0 && (
                    <>
                      <span>·</span>
                      <span>已同步 {f.syncCount} 次</span>
                    </>
                  )}
                  {!f.activeInSurface && (
                    <>
                      <span>·</span>
                      <span>已合并</span>
                    </>
                  )}
                </div>
                <div className="dcf-file-chip" title={f.relativePath}>
                  {cleanFileLabel(f)}
                </div>
                <div className="dcf-row" style={{ marginTop: 2 }}>
                  {f.activeInSurface ? (
                    <>
                      <button
                        type="button"
                        className="dcf-btn dcf-btn-soft"
                        disabled={busy}
                        onClick={() => void openEditorForRecord(f, "fold")}
                      >
                        编辑与同步
                      </button>
                      <button
                        type="button"
                        className="dcf-btn dcf-btn-ghost"
                        disabled={busy || !snap?.isIdle}
                        title="直接读取磁盘最新修改并原地同步进上下文"
                        onClick={(e) => void handleQuickDiskSync(f, e)}
                      >
                        <IconSync />
                        <span>同步磁盘</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="dcf-btn dcf-btn-ghost"
                      disabled={busy}
                      onClick={() => void openEditorForRecord(f, "fold")}
                    >
                      查看/编辑档案
                    </button>
                  )}
                  <button
                    type="button"
                    className="dcf-btn dcf-btn-ghost"
                    onClick={() => handleOpenExternalFile(f)}
                    title={f.relativePath}
                  >
                    <IconFile />
                    <span>原文件</span>
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {view === "editor" && editingRecord && (
          <>
            <input
              className="dcf-input dcf-input-title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="输入档案标题"
            />
            <div className="dcf-meta-line" style={{ padding: "0 4px 2px" }}>
              <span>{formatTurnRangeChinese(editingRecord.turns, editingRecord.startTurn, editingRecord.endTurn)}</span>
              <span>·</span>
              <span className="dcf-file-chip" title={editingRecord.relativePath}>
                {cleanFileLabel(editingRecord)}
              </span>
            </div>

            {editorMode === "fold" && !isEditingActiveInSurface && (
              <div className="dcf-banner dcf-banner-info">
                <span className="dcf-banner-text">
                  该档案已被后续压缩合并，当前仅支持编辑保存磁盘文件。
                </span>
              </div>
            )}

            <div className="dcf-label" style={{ marginTop: 4 }}>
              <span>注入主线的精华</span>
              <span className="dcf-tag">~{formatCompact(estimateTokens(editSummary))} tok</span>
            </div>
            <div className="dcf-running-host" style={{ borderRadius: 8 }}>
              {busy && <RunningBorder radius={8} color="#0d9488" />}
              <textarea
                className="dcf-textarea"
                rows={11}
                value={editSummary}
                onChange={(e) => setEditSummary(e.target.value)}
                placeholder="这段精炼内容将替换原区间进入模型上下文…"
              />
            </div>

            <div className="dcf-row" style={{ justifyContent: "space-between", marginTop: 2 }}>
              <button
                type="button"
                className="dcf-disclosure"
                onClick={() => setShowDetails((v) => !v)}
              >
                <IconChevron open={showDetails} />
                <span>详细复盘与数据（不占上下文）</span>
              </button>
              <button
                type="button"
                className="dcf-btn dcf-btn-ghost"
                disabled={busy}
                onClick={() => void openEditorForRecord(editingRecord, editorMode)}
                title="放弃当前框内修改，重新从硬盘读取最新文件内容"
              >
                <IconRefresh size={12} />
                <span>重载磁盘</span>
              </button>
            </div>

            {showDetails && (
              <textarea
                className="dcf-textarea dcf-textarea-mono"
                rows={12}
                value={editDetails}
                onChange={(e) => setEditDetails(e.target.value)}
              />
            )}
          </>
        )}
      </div>

      {view === "map" && selectedStats && (
        <div className="dcf-footer dcf-running-host">
          {busy && <RunningBorder radius={0} />}
          <div className="dcf-turn-head">
            <span className="dcf-metric">
              已选 <strong>{selectedStats.label}</strong>
              <span className="dcf-hint">
                （{selectedStats.activeTurns} 轮{selectedStats.segmentCount > 1 ? ` · ${selectedStats.segmentCount} 段` : ""}）
              </span>
            </span>
            <span className="dcf-tag dcf-tag-warn">
              约 {formatCompact(selectedStats.tokens)} tok
            </span>
          </div>
          <input
            className="dcf-input"
            placeholder="可选：为这次折出起个名字（如：某股手法验证）"
            value={foldTitle}
            onChange={(e) => setFoldTitle(e.target.value)}
          />
          <div className="dcf-row">
            <button
              ref={primaryActionRef}
              type="button"
              className="dcf-btn dcf-btn-primary"
              style={{ flex: 1 }}
              disabled={busy || selectedStats.activeTurns === 0}
              onClick={() => void handlePrepare()}
            >
              {busy ? "正在提炼预览…" : "生成双层提炼预览"}
            </button>
            <button
              type="button"
              className="dcf-btn dcf-btn-ghost"
              disabled={busy}
              onClick={() => {
                setSelectedTurns([]);
                lastClickedTurnRef.current = null;
              }}
            >
              清空
            </button>
          </div>
        </div>
      )}

      {view === "editor" && editingRecord && (
        <div className="dcf-footer dcf-running-host">
          {busy && <RunningBorder radius={0} color={editorMode === "draft" ? "#4d6bfe" : "#0d9488"} />}
          <div className="dcf-row">
            {editorMode === "draft" ? (
              <>
                <button
                  ref={primaryActionRef}
                  type="button"
                  className="dcf-btn dcf-btn-primary"
                  style={{ flex: 1 }}
                  disabled={busy || !snap?.isIdle}
                  onClick={() => void handleApplyDraft()}
                >
                  {busy ? "正在替换上下文…" : "确认折出并替换上下文"}
                </button>
                <button
                  type="button"
                  className="dcf-btn dcf-btn-danger"
                  disabled={busy}
                  onClick={() => void handleDiscardDraft(editingRecord.foldId)}
                >
                  丢弃
                </button>
              </>
            ) : (
              <>
                {isEditingActiveInSurface ? (
                  <button
                    ref={primaryActionRef}
                    type="button"
                    className="dcf-btn dcf-btn-primary"
                    style={{ flex: 1 }}
                    disabled={busy || !snap?.isIdle}
                    onClick={() => void handleSyncFold()}
                  >
                    {busy ? "同步中…" : "保存并原地同步"}
                  </button>
                ) : (
                  <button
                    ref={primaryActionRef}
                    type="button"
                    className="dcf-btn dcf-btn-primary"
                    style={{ flex: 1 }}
                    disabled={busy}
                    onClick={() => void handleSaveFileOnly()}
                  >
                    {busy ? "保存中…" : "仅保存档案文件"}
                  </button>
                )}
                <button
                  type="button"
                  className="dcf-btn dcf-btn-ghost"
                  onClick={() => handleOpenExternalFile(editingRecord)}
                >
                  <IconFile />
                  <span>原文件</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
