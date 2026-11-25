const STYLE_ID = "dsh-context-fold-styles";

const CSS = `
.dcf-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  font-family: inherit;
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: 1.5;
  color: var(--dsw-alias-label-primary, inherit);
  background: transparent;
  -webkit-font-smoothing: antialiased;
}

/* ── Top Header ───────────────────────────────────────── */
.dcf-header {
  padding: 10px 14px 9px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l3, rgba(128,128,128,0.16));
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: none;
}
.dcf-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.dcf-header-metrics {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}
.dcf-metric {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, rgba(128,128,128,0.9));
  font-variant-numeric: tabular-nums;
}
.dcf-metric strong {
  font-weight: 600;
  color: var(--dsw-alias-label-primary, inherit);
}
.dcf-metric-saved {
  color: #0d9488;
  font-weight: 500;
}
.dcf-metric-dot {
  color: var(--dsw-alias-label-dimmed, rgba(128,128,128,0.45));
}
.dcf-metric-warn {
  color: #d97706;
  font-size: 11.5px;
}
.dcf-header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: none;
}

/* ── Tabs ─────────────────────────────────────────────── */
.dcf-tabs {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 14px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l3, rgba(128,128,128,0.16));
  flex: none;
}
.dcf-tab {
  position: relative;
  padding: 8px 2px 9px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, rgba(128,128,128,0.85));
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: color 0.14s ease;
}
.dcf-tab:hover {
  color: var(--dsw-alias-label-primary, inherit);
}
.dcf-tab[data-active="true"] {
  color: var(--dsw-alias-label-primary, inherit);
  font-weight: 600;
}
.dcf-tab[data-active="true"]::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -0.5px;
  height: 1.5px;
  border-radius: 2px;
  background: var(--dsw-alias-state-business-primary, #4d6bfe);
}
.dcf-tab-count {
  font-size: 11px;
  font-weight: 500;
  color: var(--dsw-alias-label-tertiary, rgba(128,128,128,0.8));
  font-variant-numeric: tabular-nums;
}

/* ── Scrollable Body ──────────────────────────────────── */
.dcf-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
  padding: 10px 12px 18px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* ── Notices / Toast Banners ──────────────────────────── */
.dcf-banner {
  padding: 7px 10px;
  border-radius: var(--dsw-radius-md, 8px);
  font-size: 12px;
  line-height: 1.48;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.dcf-banner-text {
  flex: 1;
  min-width: 0;
  word-break: break-word;
}
.dcf-banner-close {
  border: none;
  background: transparent;
  color: inherit;
  opacity: 0.6;
  cursor: pointer;
  padding: 0 2px;
  font-size: 14px;
  line-height: 1.2;
  flex: none;
}
.dcf-banner-close:hover {
  opacity: 1;
}
.dcf-banner-error {
  background: rgba(239, 68, 68, 0.08);
  color: var(--dsw-alias-state-error-primary, #dc2626);
  border: 0.5px solid rgba(239, 68, 68, 0.22);
}
.dcf-banner-ok {
  background: rgba(13, 148, 136, 0.08);
  color: #0f766e;
  border: 0.5px solid rgba(13, 148, 136, 0.2);
}
.dcf-banner-info {
  background: var(--dsw-alias-bg-module-platform, rgba(128,128,128,0.06));
  color: var(--dsw-alias-label-secondary, inherit);
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(128,128,128,0.16));
}

/* ── Turn Map Rows ────────────────────────────────────── */
.dcf-turn {
  position: relative;
  border: 0.5px solid transparent;
  border-radius: var(--dsw-radius-md, 8px);
  padding: 8px 10px;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
  display: flex;
  flex-direction: column;
  gap: 5px;
  background: transparent;
}
.dcf-turn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.06));
}
.dcf-turn[data-heavy="true"]:not([data-selected="true"]):not([data-folded="true"]) {
  background: rgba(245, 158, 11, 0.045);
  border-color: rgba(245, 158, 11, 0.16);
}
.dcf-turn[data-selected="true"] {
  background: rgba(77, 107, 254, 0.08);
  border-color: rgba(77, 107, 254, 0.36);
}
.dcf-turn[data-folded="true"] {
  opacity: 0.62;
  border: 0.5px dashed var(--dsw-alias-border-l3, rgba(128,128,128,0.22));
}
.dcf-turn[data-folded="true"]:hover {
  opacity: 0.88;
}
.dcf-turn-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.dcf-turn-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.dcf-turn-num {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary, inherit);
  padding: 1px 5px;
  border-radius: var(--dsw-radius-xs, 4px);
  background: var(--dsw-alias-bg-module-platform, rgba(128,128,128,0.09));
  font-variant-numeric: tabular-nums;
}
.dcf-turn[data-selected="true"] .dcf-turn-num {
  background: var(--dsw-alias-state-business-primary, #4d6bfe);
  color: #ffffff;
}
.dcf-turn-preview {
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--dsw-alias-label-primary, inherit);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-word;
}
.dcf-turn[data-folded="true"] .dcf-turn-preview {
  color: var(--dsw-alias-label-secondary, inherit);
}
.dcf-bar-track {
  height: 2.5px;
  border-radius: 99px;
  background: var(--dsw-alias-border-l4, rgba(128,128,128,0.1));
  overflow: hidden;
  margin-top: 1px;
}
.dcf-bar-fill {
  height: 100%;
  border-radius: 99px;
  background: var(--dsw-alias-state-business-primary, #4d6bfe);
  opacity: 0.55;
  transition: width 0.2s ease;
}
.dcf-bar-fill[data-heavy="true"] {
  background: #d97706;
  opacity: 0.85;
}

/* ── Subtle Tags & Pills ──────────────────────────────── */
.dcf-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--dsw-alias-label-tertiary, rgba(128,128,128,0.9));
  background: var(--dsw-alias-bg-module-platform, rgba(128,128,128,0.08));
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dcf-tag-saved {
  color: #0d9488;
  background: rgba(13, 148, 136, 0.1);
}
.dcf-tag-warn {
  color: #b45309;
  background: rgba(245, 158, 11, 0.13);
}
.dcf-tag-mark {
  color: var(--dsw-alias-state-business-primary, #4d6bfe);
  background: rgba(77, 107, 254, 0.1);
}

/* ── Section Heading & Archive Cards ──────────────────── */
.dcf-section-title {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--dsw-alias-label-tertiary, rgba(128,128,128,0.85));
  letter-spacing: 0.02em;
  margin: 4px 0 2px;
}
.dcf-card {
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(128,128,128,0.18));
  border-radius: var(--dsw-radius-lg, 10px);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: transparent;
  transition: border-color 0.14s ease, background 0.14s ease;
}
.dcf-card:hover {
  border-color: var(--dsw-alias-border-l2, rgba(128,128,128,0.32));
}
.dcf-card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, inherit);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dcf-meta-line {
  font-size: 11.5px;
  color: var(--dsw-alias-label-tertiary, rgba(128,128,128,0.85));
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-variant-numeric: tabular-nums;
}
.dcf-file-chip {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, rgba(128,128,128,0.9));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

/* ── Sticky Action Footer ─────────────────────────────── */
.dcf-footer {
  padding: 10px 14px 12px;
  border-top: 0.5px solid var(--dsw-alias-border-l3, rgba(128,128,128,0.16));
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: none;
  background: var(--dsw-alias-bg-base, transparent);
}
.dcf-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

/* ── Note-like Inputs & Textareas ─────────────────────── */
.dcf-input, .dcf-textarea {
  width: 100%;
  box-sizing: border-box;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.24));
  border-radius: var(--dsw-radius-md, 8px);
  background: var(--dsw-alias-bg-module-platform, rgba(128,128,128,0.03));
  color: var(--dsw-alias-label-primary, inherit);
  font: inherit;
  padding: 7px 10px;
  outline: none;
  transition: border-color 0.14s ease, background 0.14s ease;
}
.dcf-input:focus, .dcf-textarea:focus {
  border-color: var(--dsw-alias-state-business-primary, #4d6bfe);
  background: var(--dsw-alias-bg-base, transparent);
}
.dcf-input-title {
  font-size: 14px;
  font-weight: 600;
  padding: 6px 9px;
  border-color: transparent;
  background: transparent;
}
.dcf-input-title:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.05));
}
.dcf-input-title:focus {
  border-color: var(--dsw-alias-border-l2, rgba(128,128,128,0.28));
  background: var(--dsw-alias-bg-base, transparent);
}
.dcf-textarea {
  resize: vertical;
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.65;
  padding: 10px 11px;
}
.dcf-textarea-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
}

/* ── Disclosure Accordion ─────────────────────────────── */
.dcf-disclosure {
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary, rgba(128,128,128,0.9));
  padding: 5px 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: var(--dsw-radius-sm, 6px);
}
.dcf-disclosure:hover {
  color: var(--dsw-alias-label-primary, inherit);
  background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.06));
}
.dcf-chevron {
  transition: transform 0.16s ease;
}
.dcf-chevron[data-open="true"] {
  transform: rotate(90deg);
}

/* ── Buttons (Primary / Soft / Ghost / Danger) ────────── */
.dcf-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.24));
  background: transparent;
  color: var(--dsw-alias-label-primary, inherit);
  border-radius: var(--dsw-radius-sm, 6px);
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.3;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease, opacity 0.12s ease;
}
.dcf-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.08));
}
.dcf-btn:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}
.dcf-btn-ghost {
  border-color: transparent;
  color: var(--dsw-alias-label-secondary, rgba(128,128,128,0.9));
  padding: 4px 7px;
}
.dcf-btn-ghost:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary, inherit);
  background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.08));
}
.dcf-btn-icon {
  width: 28px;
  height: 28px;
  padding: 0;
  border-color: transparent;
  color: var(--dsw-alias-label-secondary, rgba(128,128,128,0.9));
}
.dcf-btn-icon:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary, inherit);
  background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.08));
}
.dcf-btn-primary {
  background: var(--dsw-alias-state-business-primary, #4d6bfe);
  border-color: transparent;
  color: #ffffff;
}
.dcf-btn-primary:hover:not(:disabled) {
  background: var(--dsw-alias-state-business-primary, #4d6bfe);
  filter: brightness(1.06);
}
.dcf-btn-soft {
  background: rgba(77, 107, 254, 0.1);
  border-color: transparent;
  color: var(--dsw-alias-state-business-primary, #4d6bfe);
}
.dcf-btn-soft:hover:not(:disabled) {
  background: rgba(77, 107, 254, 0.16);
}
.dcf-btn-danger {
  border-color: transparent;
  color: var(--dsw-alias-state-error-primary, #dc2626);
  background: transparent;
}
.dcf-btn-danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.08);
}

/* ── Header Utility Button in Conversation Bar ────────── */
.dcf-header-trigger {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 8px;
  border-radius: var(--dsw-radius-sm, 6px);
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary, inherit);
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 500;
  transition: background 0.12s ease, color 0.12s ease;
}
.dcf-header-trigger:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.08));
  color: var(--dsw-alias-label-primary, inherit);
}

.dcf-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary, rgba(128,128,128,0.9));
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
}
.dcf-empty {
  padding: 28px 12px;
  text-align: center;
  color: var(--dsw-alias-label-tertiary, rgba(128,128,128,0.8));
  font-size: 12.5px;
  line-height: 1.6;
}

/* ── Turn Checkbox (Multi-Select) ─────────────────────── */
.dcf-check {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.34));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  background: transparent;
  color: #ffffff;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.dcf-check[data-checked="true"] {
  background: var(--dsw-alias-state-business-primary, #4d6bfe);
  border-color: var(--dsw-alias-state-business-primary, #4d6bfe);
}
.dcf-hint {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, rgba(128,128,128,0.75));
}

/* ── Lancer-inspired Streamline Motion ────────────────── */
.dcf-running-host {
  position: relative;
}
.dcf-running-border {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
  fill: none;
  stroke: var(--dcf-light-color, var(--dsw-alias-state-business-primary, #4d6bfe));
  stroke-width: 1.25px;
  filter: drop-shadow(0 0 2.5px color-mix(in srgb, var(--dcf-light-color, #4d6bfe) 42%, transparent));
}
.dcf-running-border rect {
  vector-effect: non-scaling-stroke;
  stroke-dasharray: 9 91;
  animation: dcf-orbit-border 3.4s linear infinite;
}
@keyframes dcf-orbit-border {
  to {
    stroke-dashoffset: -100;
  }
}
.dcf-flight-overlay {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 9999;
  overflow: visible;
}
@media (prefers-reduced-motion: reduce) {
  .dcf-running-border rect {
    animation: none;
    stroke-dasharray: none;
    opacity: 0.5;
  }
}
`;

export function ensureStyles() {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(STYLE_ID);
  if (existing) {
    if (existing.textContent !== CSS) existing.textContent = CSS;
    return;
  }
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}
