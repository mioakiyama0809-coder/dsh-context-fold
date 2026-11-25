window.__ModuleLoader__.load({
  id: "dsh-context-fold",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.jsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react3 = __toESM(require("react"), 1);

// src/shared/constants.js
var PLUGIN_ID = "dsh-context-fold";
var API_PREFIX = "/api/context-fold";
var SIDEBAR_TAB_KIND = "context-fold";

// src/client/FoldPanel.jsx
var import_react2 = __toESM(require("react"), 1);

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
function formatTurnLabel(turns, { prefix = "T", sep = ", ", fallbackStart, fallbackEnd } = {}) {
  const groups = groupContiguousTurns(normalizeTurns(turns, fallbackStart, fallbackEnd));
  if (groups.length === 0) return "";
  return groups.map(
    (g) => g.startTurn === g.endTurn ? `${prefix}${g.startTurn}` : `${prefix}${g.startTurn}\u2013${prefix}${g.endTurn}`
  ).join(sep);
}
function formatTurnRangeChinese(turns, fallbackStart, fallbackEnd) {
  const groups = groupContiguousTurns(normalizeTurns(turns, fallbackStart, fallbackEnd));
  if (groups.length === 0) return "\u672A\u77E5\u8F6E\u6B21";
  const parts = groups.map(
    (g) => g.startTurn === g.endTurn ? `${g.startTurn}` : `${g.startTurn}\u2013${g.endTurn}`
  );
  return `\u7B2C ${parts.join("\u3001")} \u8F6E`;
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

// src/client/api.js
async function request(path, { method = "GET", body, timeoutMs = 15e3 } = {}) {
  const init = {
    method,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs)
  };
  if (body !== void 0) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_PREFIX}/${path}`, init);
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`\u670D\u52A1\u8FD4\u56DE\u65E0\u6548\u54CD\u5E94 (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : `\u8BF7\u6C42\u5931\u8D25 (${res.status})`);
  }
  return data;
}
function fetchState(sessionId) {
  return request(`state?sessionId=${encodeURIComponent(sessionId)}`);
}
function addMark(sessionId, { label, turn } = {}) {
  return request("mark", {
    method: "POST",
    body: { sessionId, label, turn }
  });
}
function removeMark(sessionId, markId) {
  return request("mark", {
    method: "POST",
    body: { sessionId, action: "remove", markId }
  });
}
function prepareFold(sessionId, { turns, startTurn, endTurn, title }) {
  return request("prepare", {
    method: "POST",
    body: { sessionId, turns, startTurn, endTurn, title },
    timeoutMs: 12e4
  });
}
function applyFold(sessionId, { foldId, title, summary, details }) {
  return request("apply", {
    method: "POST",
    body: { sessionId, foldId, title, summary, details },
    timeoutMs: 3e4
  });
}
function discardDraft(sessionId, foldId) {
  return request("discard", {
    method: "POST",
    body: { sessionId, foldId }
  });
}
function fetchDocument(sessionId, foldId) {
  return request(
    `document?sessionId=${encodeURIComponent(sessionId)}&foldId=${encodeURIComponent(foldId)}`
  );
}
function saveDocumentOnly(sessionId, { foldId, title, summary, details }) {
  return request("save-file", {
    method: "POST",
    body: { sessionId, foldId, title, summary, details }
  });
}
function syncFold(sessionId, { foldId, title, summary, details }) {
  return request("sync", {
    method: "POST",
    body: {
      sessionId,
      foldId,
      ...title !== void 0 ? { title } : {},
      ...summary !== void 0 ? { summary } : {},
      ...details !== void 0 ? { details } : {}
    },
    timeoutMs: 3e4
  });
}

// src/client/motion.jsx
var import_react = __toESM(require("react"), 1);
var import_jsx_runtime = require("react/jsx-runtime");
var FLIGHT_SECONDS = 0.9;
var LANDING_SECONDS = 0.55;
var clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));
var segment = (v, a, b) => clamp((v - a) / (b - a));
var smoothstep = (t) => t * t * (3 - 2 * t);
var outEase = (t) => 1 - Math.pow(1 - clamp(t), 3);
function cubicPoint(pts, t) {
  const [a, c1, c2, b] = pts;
  const q = 1 - t;
  return {
    x: q * q * q * a.x + 3 * q * q * t * c1.x + 3 * q * t * t * c2.x + t * t * t * b.x,
    y: q * q * q * a.y + 3 * q * q * t * c1.y + 3 * q * t * t * c2.y + t * t * t * b.y
  };
}
function cubicPath([a, c1, c2, b]) {
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}
function flightControls(a, b, seed = 0.35) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const amp = Math.min(140, Math.max(36, len * (0.18 + seed % 0.14)));
  const dir = seed >= 0.5 ? 1 : -1;
  const ctrl = (frac, bend) => ({
    x: a.x + dx * frac - dy / len * bend,
    y: a.y + dy * frac + dx / len * bend
  });
  return [ctrl(0.28, dir * amp), ctrl(0.68, dir * amp * 0.72)];
}
function approxArcLength(pts, endT) {
  let len = 0;
  let prev = pts[0];
  const steps = 40;
  for (let i = 1; i <= steps; i++) {
    const next = cubicPoint(pts, endT * i / steps);
    len += Math.hypot(next.x - prev.x, next.y - prev.y);
    prev = next;
  }
  return len;
}
function prefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function RunningBorder({ radius = 8, color }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "svg",
    {
      className: "dcf-running-border",
      style: color ? { "--dcf-light-color": color } : void 0,
      "aria-hidden": "true",
      focusable: "false",
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "rect",
        {
          x: "1",
          y: "1",
          width: "calc(100% - 2px)",
          height: "calc(100% - 2px)",
          rx: radius,
          pathLength: "100"
        }
      )
    }
  );
}
function useStreamlineFlights() {
  const flightsRef = (0, import_react.useRef)([]);
  const [hasActive, setHasActive] = (0, import_react.useState)(false);
  const svgRef = (0, import_react.useRef)(null);
  const rafRef = (0, import_react.useRef)(0);
  const serialRef = (0, import_react.useRef)(1);
  const renderFrame = (0, import_react.useCallback)(() => {
    rafRef.current = 0;
    const svg = svgRef.current;
    const now = performance.now();
    const alive = [];
    for (const f of flightsRef.current) {
      const age = (now - f.startedAt) / 1e3;
      if (age < FLIGHT_SECONDS + LANDING_SECONDS) {
        alive.push({ ...f, age });
      }
    }
    flightsRef.current = alive;
    if (alive.length === 0) {
      if (svg) svg.innerHTML = "";
      setHasActive(false);
      return;
    }
    if (svg) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      svg.setAttribute("viewBox", `0 0 ${vw} ${vh}`);
      const ns = "http://www.w3.org/2000/svg";
      const frag = document.createDocumentFragment();
      const defs = document.createElementNS(ns, "defs");
      frag.appendChild(defs);
      for (const f of alive) {
        const g = document.createElementNS(ns, "g");
        const flightProgress = clamp(f.age / FLIGHT_SECONDS);
        if (f.age < FLIGHT_SECONDS) {
          const headT = smoothstep(flightProgress);
          const tailT = smoothstep(segment(flightProgress, 0.55, 1)) * 0.45;
          const pA = cubicPoint(f.points, tailT);
          const pB = cubicPoint(f.points, headT);
          const startLen = approxArcLength(f.points, tailT);
          const endLen = approxArcLength(f.points, headT);
          const totalLen = f.totalLen;
          const dash = `${Math.max(0, endLen - startLen).toFixed(1)} ${(totalLen + 2).toFixed(1)}`;
          const fadeOut = 1 - segment(flightProgress, 0.85, 1);
          const gradId = `dcf-flight-g-${f.id}`;
          const grad = document.createElementNS(ns, "linearGradient");
          grad.setAttribute("id", gradId);
          grad.setAttribute("gradientUnits", "userSpaceOnUse");
          grad.setAttribute("x1", pA.x.toFixed(1));
          grad.setAttribute("y1", pA.y.toFixed(1));
          grad.setAttribute("x2", pB.x.toFixed(1));
          grad.setAttribute("y2", pB.y.toFixed(1));
          const s0 = document.createElementNS(ns, "stop");
          s0.setAttribute("offset", "0%");
          s0.setAttribute("stop-color", f.color);
          s0.setAttribute("stop-opacity", "0");
          const s1 = document.createElementNS(ns, "stop");
          s1.setAttribute("offset", "100%");
          s1.setAttribute("stop-color", f.color);
          s1.setAttribute("stop-opacity", String(fadeOut.toFixed(3)));
          grad.appendChild(s0);
          grad.appendChild(s1);
          defs.appendChild(grad);
          for (const [w, op] of [
            [6, 0.08 * fadeOut],
            [2.6, 0.15 * fadeOut]
          ]) {
            const halo = document.createElementNS(ns, "path");
            halo.setAttribute("d", f.d);
            halo.setAttribute("fill", "none");
            halo.setAttribute("stroke", f.color);
            halo.setAttribute("stroke-linecap", "round");
            halo.setAttribute("stroke-width", String(w));
            halo.setAttribute("opacity", op.toFixed(3));
            halo.setAttribute("stroke-dasharray", dash);
            halo.setAttribute("stroke-dashoffset", (-startLen).toFixed(1));
            g.appendChild(halo);
          }
          const core = document.createElementNS(ns, "path");
          core.setAttribute("d", f.d);
          core.setAttribute("fill", "none");
          core.setAttribute("stroke", `url(#${gradId})`);
          core.setAttribute("stroke-linecap", "round");
          core.setAttribute("stroke-width", "1.4");
          core.setAttribute("stroke-dasharray", dash);
          core.setAttribute("stroke-dashoffset", (-startLen).toFixed(1));
          g.appendChild(core);
          const headHalo = document.createElementNS(ns, "circle");
          headHalo.setAttribute("cx", pB.x.toFixed(1));
          headHalo.setAttribute("cy", pB.y.toFixed(1));
          headHalo.setAttribute("r", "6");
          headHalo.setAttribute("fill", f.color);
          headHalo.setAttribute("opacity", (0.18 * fadeOut).toFixed(3));
          g.appendChild(headHalo);
          const headDot = document.createElementNS(ns, "circle");
          headDot.setAttribute("cx", pB.x.toFixed(1));
          headDot.setAttribute("cy", pB.y.toFixed(1));
          headDot.setAttribute("r", "2.2");
          headDot.setAttribute("fill", f.color);
          headDot.setAttribute("opacity", fadeOut.toFixed(3));
          g.appendChild(headDot);
        }
        const landAge = f.age - FLIGHT_SECONDS * 0.88;
        if (landAge >= 0 && landAge < LANDING_SECONDS) {
          const lp = outEase(landAge / LANDING_SECONDS);
          const dest = f.points[3];
          const ring = document.createElementNS(ns, "circle");
          ring.setAttribute("cx", dest.x.toFixed(1));
          ring.setAttribute("cy", dest.y.toFixed(1));
          ring.setAttribute("r", (5 + lp * 22).toFixed(1));
          ring.setAttribute("fill", "none");
          ring.setAttribute("stroke", f.color);
          ring.setAttribute("stroke-width", "1.25");
          ring.setAttribute("opacity", ((1 - lp) * 0.55).toFixed(3));
          g.appendChild(ring);
        }
        frag.appendChild(g);
      }
      svg.replaceChildren(frag);
    }
    rafRef.current = requestAnimationFrame(renderFrame);
  }, []);
  (0, import_react.useEffect)(() => {
    if (hasActive && !rafRef.current) {
      rafRef.current = requestAnimationFrame(renderFrame);
    }
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [hasActive, renderFrame]);
  const launchFlight = (0, import_react.useCallback)(
    ({ fromEl, toEl, fromPoint, toPoint, color = "#4d6bfe", seed = 0.35 }) => {
      if (prefersReducedMotion()) return;
      const getCenter = (el) => {
        if (!el || typeof el.getBoundingClientRect !== "function") return null;
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) return null;
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      };
      const a = fromPoint ?? getCenter(fromEl);
      const b = toPoint ?? getCenter(toEl);
      if (!a || !b) return;
      const controls = flightControls(a, b, seed);
      const points = [a, controls[0], controls[1], b];
      const totalLen = approxArcLength(points, 1);
      flightsRef.current.push({
        id: serialRef.current++,
        points,
        d: cubicPath(points),
        totalLen,
        color,
        startedAt: performance.now()
      });
      setHasActive(true);
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(renderFrame);
      }
    },
    [renderFrame]
  );
  const FlightOverlay = hasActive ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { ref: svgRef, className: "dcf-flight-overlay", "aria-hidden": "true", focusable: "false" }) : null;
  return { launchFlight, FlightOverlay };
}

// src/client/styles.js
var STYLE_ID = "dsh-context-fold-styles";
var CSS = `
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

/* \u2500\u2500 Top Header \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
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

/* \u2500\u2500 Tabs \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
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

/* \u2500\u2500 Scrollable Body \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
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

/* \u2500\u2500 Notices / Toast Banners \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
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

/* \u2500\u2500 Turn Map Rows \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
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

/* \u2500\u2500 Subtle Tags & Pills \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
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

/* \u2500\u2500 Section Heading & Archive Cards \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
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

/* \u2500\u2500 Sticky Action Footer \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
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

/* \u2500\u2500 Note-like Inputs & Textareas \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
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

/* \u2500\u2500 Disclosure Accordion \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
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

/* \u2500\u2500 Buttons (Primary / Soft / Ghost / Danger) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
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

/* \u2500\u2500 Header Utility Button in Conversation Bar \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
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

/* \u2500\u2500 Turn Checkbox (Multi-Select) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
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

/* \u2500\u2500 Lancer-inspired Streamline Motion \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
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
function ensureStyles() {
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

// src/client/FoldPanel.jsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function formatCompact(n) {
  const num = Number(n ?? 0);
  if (num >= 1e4) return `${(num / 1e3).toFixed(1)}k`;
  return num.toLocaleString("en-US");
}
function cleanFileLabel(record) {
  const name = record?.fileName || String(record?.relativePath ?? "").split("/").pop() || "";
  return name.replace(/-[a-f0-9]{6}\.md$/i, ".md");
}
function toFileResourceUri(sessionId, relativePath) {
  const norm = String(relativePath ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  const encodedPath = norm.split("/").filter(Boolean).map((seg) => encodeURIComponent(seg)).join("/");
  return `dsh-resource://file/session/${encodeURIComponent(sessionId)}/${encodedPath}`;
}
function IconRefresh({ size = 14 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M21 12a9 9 0 1 1-2.64-6.36" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M21 3v6h-6" })
  ] });
}
function IconBookmark({ size = 13 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" }) });
}
function IconFile({ size = 13 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M14 2v4a2 2 0 0 0 2 2h4" })
  ] });
}
function IconSync({ size = 13 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M3 12a9 9 0 0 1 15.36-6.36L21 8" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M21 3v5h-5" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M21 12a9 9 0 0 1-15.36 6.36L3 16" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M8 16H3v5" })
  ] });
}
function IconChevron({ open, size = 13 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { className: "dcf-chevron", "data-open": open, width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "m9 18 6-6-6-6" }) });
}
function IconCheck({ size = 10 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M20 6 9 17l-5-5" }) });
}
function FoldPanel({ useTabInfo, sessionId }) {
  ensureStyles();
  const tabInfo = typeof useTabInfo === "function" ? useTabInfo() : null;
  const tabActions = tabInfo?.tab?.actions;
  const { launchFlight, FlightOverlay } = useStreamlineFlights();
  const activeMetricRef = (0, import_react2.useRef)(null);
  const archivesTabRef = (0, import_react2.useRef)(null);
  const editorTabRef = (0, import_react2.useRef)(null);
  const primaryActionRef = (0, import_react2.useRef)(null);
  const lastClickedTurnRef = (0, import_react2.useRef)(null);
  const [view, setView] = (0, import_react2.useState)("map");
  const [snap, setSnap] = (0, import_react2.useState)(null);
  const [loading, setLoading] = (0, import_react2.useState)(false);
  const [busy, setBusy] = (0, import_react2.useState)(false);
  const [error, setError] = (0, import_react2.useState)("");
  const [notice, setNotice] = (0, import_react2.useState)("");
  const [selectedTurns, setSelectedTurns] = (0, import_react2.useState)([]);
  const [foldTitle, setFoldTitle] = (0, import_react2.useState)("");
  const [showMarkBox, setShowMarkBox] = (0, import_react2.useState)(false);
  const [markLabel, setMarkLabel] = (0, import_react2.useState)("");
  const [editorMode, setEditorMode] = (0, import_react2.useState)("draft");
  const [editingRecord, setEditingRecord] = (0, import_react2.useState)(null);
  const [editTitle, setEditTitle] = (0, import_react2.useState)("");
  const [editSummary, setEditSummary] = (0, import_react2.useState)("");
  const [editDetails, setEditDetails] = (0, import_react2.useState)("");
  const [showDetails, setShowDetails] = (0, import_react2.useState)(false);
  const reload = (0, import_react2.useCallback)(
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
  (0, import_react2.useEffect)(() => {
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
  (0, import_react2.useEffect)(() => {
    if (!sessionId || !snap || snap.isIdle) return;
    const timer = setInterval(() => {
      void reload({ silent: true });
    }, 2500);
    return () => clearInterval(timer);
  }, [sessionId, snap?.isIdle, reload]);
  (0, import_react2.useEffect)(() => {
    if (!tabActions?.bindCommands) return;
    return tabActions.bindCommands({
      refresh: () => {
        void reload();
      }
    });
  }, [tabActions, reload]);
  const maxTurnTokens = (0, import_react2.useMemo)(() => {
    if (!snap?.turns?.length) return 1;
    return Math.max(1, ...snap.turns.map((t) => t.activeTokens || 0));
  }, [snap]);
  const totalSavedTokens = (0, import_react2.useMemo)(() => {
    if (!snap?.folds?.length) return 0;
    return snap.folds.reduce((acc, f) => acc + Math.max(0, f.savedTokens || 0), 0);
  }, [snap]);
  const selectedTurnSet = (0, import_react2.useMemo)(() => new Set(selectedTurns), [selectedTurns]);
  const selectedStats = (0, import_react2.useMemo)(() => {
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
      activeTurns: activeTurnNums.length
    };
  }, [snap, selectedTurns, selectedTurnSet]);
  const openEditorForRecord = (0, import_react2.useCallback)(
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
      const activeInSpan = snap.turns.filter((item) => item.turn >= lo && item.turn <= hi && item.status === "active").map((item) => item.turn);
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
      setNotice(`\u5DF2\u6253\u8D77\u70B9\u6807\u8BB0\u300C${m.label}\u300D\uFF08\u7B2C ${m.turn} \u8F6E\uFF09`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const handleSelectMarkRange = (mark) => {
    if (!snap || mark.turn > snap.turnCount) {
      setNotice(`\u6807\u8BB0\u8D77\u70B9\u5728\u7B2C ${mark.turn} \u8F6E\uFF0C\u7B49\u9A8C\u8BC1\u5BF9\u8BDD\u5F00\u59CB\u540E\u518D\u9009\u5373\u53EF\u3002`);
      return;
    }
    const activeInMark = snap.turns.filter((item) => item.turn >= mark.turn && item.turn <= snap.turnCount && item.status === "active").map((item) => item.turn);
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
        title: foldTitle.trim()
      });
      setEditorMode("draft");
      setEditingRecord(res.draft);
      setEditTitle(res.title);
      setEditSummary(res.summary);
      setEditDetails(res.details);
      setShowDetails(false);
      setView("editor");
      setNotice("\u9884\u89C8\u5DF2\u751F\u6210\uFF1A\u5FAE\u8C03\u7CBE\u534E\u540E\u70B9\u51FB\u4E0B\u65B9\u300C\u786E\u8BA4\u6298\u51FA\u300D\u5373\u53EF\u66FF\u6362\u4E0A\u4E0B\u6587\u3002");
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
    if (fromEl && typeof window !== "undefined") {
      const r = fromEl.getBoundingClientRect();
      if (r.left > 240) {
        launchFlight({
          fromEl,
          toPoint: { x: Math.max(120, r.left - 180), y: Math.max(96, r.top - 120) },
          color: "#4d6bfe",
          seed: 0.22
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
        details: editDetails
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
        `${rangeCn}\u5DF2\u6298\u51FA\uFF0C\u8282\u7701\u7EA6 ${formatCompact(res.commit.savedTokens)} tok\u3002`
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
      setNotice("\u5DF2\u4E22\u5F03\u672A\u5E94\u7528\u7684\u8349\u7A3F\u3002");
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
        details: editDetails
      });
      fireSyncFlight(primaryActionRef.current);
      setEditingRecord({ ...res.fold, activeInSurface: true });
      setNotice(
        `\u5DF2\u539F\u5730\u540C\u6B65\uFF08\u7B2C ${res.fold.syncCount} \u6B21 \xB7 \u7EA6 ${formatCompact(res.resync.foldedTokens)} tok\uFF09\u3002`
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
        `\u5DF2\u4ECE\u78C1\u76D8\u540C\u6B65\u300C${res.fold.title}\u300D\uFF08\u7EA6 ${formatCompact(res.resync.foldedTokens)} tok\uFF09\u3002`
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
        details: editDetails
      });
      setEditingRecord({ ...editingRecord, ...res.record });
      setNotice(`\u5DF2\u4FDD\u5B58\u6863\u6848\u300C${res.record.title}\u300D\u5230\u78C1\u76D8\u3002`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const editingLiveFold = (0, import_react2.useMemo)(() => {
    if (!editingRecord || !snap?.folds) return null;
    return snap.folds.find((f) => f.foldId === editingRecord.foldId) ?? null;
  }, [editingRecord, snap]);
  const isEditingActiveInSurface = editorMode === "draft" ? true : editingLiveFold?.activeInSurface ?? editingRecord?.activeInSurface ?? true;
  const handleOpenExternalFile = (record) => {
    if (!tabActions?.openResource || !record?.relativePath) return;
    try {
      tabActions.openResource(toFileResourceUri(sessionId, record.relativePath));
    } catch {
      setNotice(`\u6863\u6848\u8DEF\u5F84\uFF1A${record.relativePath}`);
    }
  };
  if (!sessionId) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dcf-root", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dcf-empty", children: "\u8BF7\u5148\u5728\u5DE6\u4FA7\u9009\u62E9\u4E00\u4E2A\u4F1A\u8BDD" }) });
  }
  const archiveCount = (snap?.folds?.length ?? 0) + (snap?.drafts?.length ?? 0);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-root", children: [
    FlightOverlay,
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-header", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-header-top", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-header-metrics", ref: activeMetricRef, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dcf-metric", title: "\u5F53\u524D\u6A21\u578B\u4E0A\u4E0B\u6587\u4E2D\u7684\u6D88\u606F\u4F30\u7B97 Token", children: [
            "\u6D3B\u8DC3 ",
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: formatCompact(snap?.totalSurfaceTokens ?? 0) }),
            " tok"
          ] }),
          totalSavedTokens > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dcf-metric-dot", children: "\xB7" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dcf-metric dcf-metric-saved", title: "\u672C\u4F1A\u8BDD\u7D2F\u8BA1\u6298\u51FA\u8282\u7701\u7684 Token", children: [
              "\u5DF2\u7701 ",
              formatCompact(totalSavedTokens)
            ] })
          ] }),
          snap && !snap.isIdle && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dcf-metric-dot", children: "\xB7" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dcf-metric-warn", children: "\u751F\u6210\u4E2D\u2026" })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-header-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
            "button",
            {
              type: "button",
              className: "dcf-btn dcf-btn-ghost",
              disabled: busy,
              onClick: () => setShowMarkBox((v) => !v),
              title: "\u5728\u5F00\u59CB\u9A8C\u8BC1\u524D\u6253\u4E00\u4E2A\u8D77\u70B9\u6807\u8BB0\uFF0C\u9A8C\u5B8C\u4E00\u952E\u9009\u4E2D\u6574\u6BB5",
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(IconBookmark, {}),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u6807\u8BB0" })
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "button",
            {
              type: "button",
              className: "dcf-btn dcf-btn-icon",
              disabled: loading || busy,
              onClick: () => void reload(),
              title: "\u5237\u65B0\u8F6E\u6B21\u5730\u56FE",
              "aria-label": "\u5237\u65B0",
              children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(IconRefresh, {})
            }
          )
        ] })
      ] }),
      showMarkBox && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "input",
          {
            className: "dcf-input",
            style: { flex: 1 },
            placeholder: "\u8F93\u5165\u9A8C\u8BC1\u4E3B\u9898\uFF08\u5982\uFF1A\u67D0\u80A1\u9F99\u864E\u699C\u590D\u76D8\uFF09",
            value: markLabel,
            onChange: (e) => setMarkLabel(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") void handleAddMark();
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            type: "button",
            className: "dcf-btn dcf-btn-primary",
            disabled: busy,
            onClick: () => void handleAddMark(),
            children: "\u6253\u6807\u8BB0"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-tabs", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "button",
        {
          type: "button",
          className: "dcf-tab",
          "data-active": view === "map",
          onClick: () => setView("map"),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u8F6E\u6B21\u5730\u56FE" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dcf-tab-count", children: snap?.turnCount ?? 0 })
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "button",
        {
          ref: archivesTabRef,
          type: "button",
          className: "dcf-tab",
          "data-active": view === "archives",
          onClick: () => setView("archives"),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u6298\u51FA\u6863\u6848" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dcf-tab-count", children: archiveCount })
          ]
        }
      ),
      editingRecord && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "button",
        {
          ref: editorTabRef,
          type: "button",
          className: "dcf-tab",
          "data-active": view === "editor",
          onClick: () => setView("editor"),
          children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: editorMode === "draft" ? "\u9884\u89C8\u786E\u8BA4" : "\u7F16\u8F91\u540C\u6B65" })
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-body", children: [
      error && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-banner dcf-banner-error", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dcf-banner-text", children: error }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "dcf-banner-close", onClick: () => setError(""), "aria-label": "\u5173\u95ED", children: "\xD7" })
      ] }),
      notice && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-banner dcf-banner-ok", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dcf-banner-text", children: notice }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "dcf-banner-close", onClick: () => setNotice(""), "aria-label": "\u5173\u95ED", children: "\xD7" })
      ] }),
      view === "map" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        snap?.marks?.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dcf-row", style: { padding: "2px 0 4px" }, children: snap.marks.map((m) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dcf-row", style: { gap: 2 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
            "button",
            {
              type: "button",
              className: "dcf-btn dcf-btn-soft",
              style: { padding: "3px 8px", fontSize: 11.5 },
              onClick: () => handleSelectMarkRange(m),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(IconBookmark, { size: 11 }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
                  "T",
                  m.turn,
                  " \u8D77 \xB7 ",
                  m.label
                ] })
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "button",
            {
              type: "button",
              className: "dcf-btn dcf-btn-ghost",
              style: { padding: "2px 5px" },
              title: "\u79FB\u9664\u6807\u8BB0",
              onClick: () => void removeMark(sessionId, m.markId).then(() => reload()),
              children: "\xD7"
            }
          )
        ] }, m.markId)) }),
        snap?.turns?.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dcf-turn-head", style: { padding: "0 2px 2px" }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dcf-hint", children: "\u5355\u51FB\u81EA\u7531\u591A\u9009\uFF08\u53EF\u8DE8\u8F6E\u8DF3\u8FC7\u4E2D\u95F4\uFF09\xB7 Shift \u70B9\u51FB\u8FDE\u9009\u533A\u95F4" }) }),
        snap?.turns?.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dcf-empty", children: "\u5F53\u524D\u4F1A\u8BDD\u8FD8\u6CA1\u6709\u5BF9\u8BDD\u8F6E\u6B21" }),
        snap?.turns?.map((t) => {
          const isSelected = t.status === "active" && selectedTurnSet.has(t.turn);
          const ratio = Math.min(100, Math.round((t.activeTokens || 0) / maxTurnTokens * 100));
          const heavy = (t.activeTokens || 0) >= 6e3;
          return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
            "div",
            {
              className: "dcf-turn",
              "data-selected": isSelected,
              "data-folded": t.status === "folded",
              "data-heavy": heavy,
              onClick: (e) => handleTurnClick(t, e),
              title: t.status === "folded" ? "\u70B9\u51FB\u67E5\u770B/\u7F16\u8F91\u5BF9\u5E94\u7684\u6298\u51FA\u6863\u6848" : "\u5355\u51FB\u5355\u72EC\u9009\u4E2D/\u53D6\u6D88\uFF0C\u6309\u4F4F Shift \u70B9\u51FB\u53EF\u8FDE\u9009\u533A\u95F4",
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-turn-head", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-turn-left", children: [
                    t.status === "active" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dcf-check", "data-checked": isSelected, "aria-hidden": "true", children: isSelected && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(IconCheck, {}) }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dcf-turn-num", children: [
                      "T",
                      t.turn
                    ] }),
                    t.markLabel && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dcf-tag dcf-tag-mark", children: t.markLabel }),
                    t.toolCallCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dcf-tag", children: [
                      t.toolCallCount,
                      " \u5DE5\u5177"
                    ] })
                  ] }),
                  t.status === "folded" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dcf-tag dcf-tag-saved", children: [
                    "\u5DF2\u6298\u51FA",
                    t.foldTitle ? ` \xB7 ${t.foldTitle}` : ""
                  ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: `dcf-tag ${heavy ? "dcf-tag-warn" : ""}`, children: [
                    formatCompact(t.activeTokens),
                    " tok"
                  ] })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dcf-turn-preview", children: t.promptPreview || t.responsePreview || "(\u7CFB\u7EDF/\u5DE5\u5177\u8F6E)" }),
                t.status === "active" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dcf-bar-track", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  "div",
                  {
                    className: "dcf-bar-fill",
                    "data-heavy": heavy,
                    style: { width: `${Math.max(3, ratio)}%` }
                  }
                ) })
              ]
            },
            t.turn
          );
        })
      ] }),
      view === "archives" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        snap?.drafts?.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dcf-section-title", children: "\u5F85\u786E\u8BA4\u8349\u7A3F" }),
          snap.drafts.map((d) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-card", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-turn-head", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dcf-card-title", children: d.title }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dcf-tag dcf-tag-warn", children: "\u5F85\u786E\u8BA4" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-meta-line", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: formatTurnLabel(d.turns, { fallbackStart: d.startTurn, fallbackEnd: d.endTurn }) }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\xB7" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
                formatCompact(d.originalTokens),
                " \u2192 ",
                formatCompact(d.foldedTokens),
                " tok"
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dcf-file-chip", title: d.relativePath, children: cleanFileLabel(d) }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-row", style: { marginTop: 2 }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "button",
                {
                  type: "button",
                  className: "dcf-btn dcf-btn-primary",
                  disabled: busy,
                  onClick: () => void openEditorForRecord(d, "draft"),
                  children: "\u5BA1\u9605\u5E76\u786E\u8BA4"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "button",
                {
                  type: "button",
                  className: "dcf-btn dcf-btn-danger",
                  disabled: busy,
                  onClick: () => void handleDiscardDraft(d.foldId),
                  children: "\u4E22\u5F03"
                }
              )
            ] })
          ] }, d.foldId))
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dcf-section-title", children: "\u5DF2\u6298\u51FA\u6863\u6848" }),
        (!snap?.folds || snap.folds.length === 0) && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-empty", children: [
          "\u8FD8\u6CA1\u6709\u5DF2\u6298\u51FA\u7684\u6BB5\u843D",
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("br", {}),
          "\u5728\u300C\u8F6E\u6B21\u5730\u56FE\u300D\u4E2D\u52FE\u9009\u4EFB\u610F\u4E00\u8F6E\u6216\u591A\u8F6E\u5373\u53EF\u6298\u51FA"
        ] }),
        snap?.folds?.map((f) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-turn-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dcf-card-title", children: f.title }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dcf-tag dcf-tag-saved", children: [
              "-",
              formatCompact(f.savedTokens),
              " tok"
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-meta-line", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: formatTurnLabel(f.turns, { fallbackStart: f.startTurn, fallbackEnd: f.endTurn }) }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\xB7" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
              formatCompact(f.originalTokens),
              " \u2192 ",
              formatCompact(f.liveTokens || f.foldedTokens),
              " tok"
            ] }),
            f.syncCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\xB7" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
                "\u5DF2\u540C\u6B65 ",
                f.syncCount,
                " \u6B21"
              ] })
            ] }),
            !f.activeInSurface && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\xB7" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u5DF2\u5408\u5E76" })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dcf-file-chip", title: f.relativePath, children: cleanFileLabel(f) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-row", style: { marginTop: 2 }, children: [
            f.activeInSurface ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "button",
                {
                  type: "button",
                  className: "dcf-btn dcf-btn-soft",
                  disabled: busy,
                  onClick: () => void openEditorForRecord(f, "fold"),
                  children: "\u7F16\u8F91\u4E0E\u540C\u6B65"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
                "button",
                {
                  type: "button",
                  className: "dcf-btn dcf-btn-ghost",
                  disabled: busy || !snap?.isIdle,
                  title: "\u76F4\u63A5\u8BFB\u53D6\u78C1\u76D8\u6700\u65B0\u4FEE\u6539\u5E76\u539F\u5730\u540C\u6B65\u8FDB\u4E0A\u4E0B\u6587",
                  onClick: (e) => void handleQuickDiskSync(f, e),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(IconSync, {}),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u540C\u6B65\u78C1\u76D8" })
                  ]
                }
              )
            ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "button",
              {
                type: "button",
                className: "dcf-btn dcf-btn-ghost",
                disabled: busy,
                onClick: () => void openEditorForRecord(f, "fold"),
                children: "\u67E5\u770B/\u7F16\u8F91\u6863\u6848"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
              "button",
              {
                type: "button",
                className: "dcf-btn dcf-btn-ghost",
                onClick: () => handleOpenExternalFile(f),
                title: f.relativePath,
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(IconFile, {}),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u539F\u6587\u4EF6" })
                ]
              }
            )
          ] })
        ] }, f.foldId))
      ] }),
      view === "editor" && editingRecord && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "input",
          {
            className: "dcf-input dcf-input-title",
            value: editTitle,
            onChange: (e) => setEditTitle(e.target.value),
            placeholder: "\u8F93\u5165\u6863\u6848\u6807\u9898"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-meta-line", style: { padding: "0 4px 2px" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: formatTurnRangeChinese(editingRecord.turns, editingRecord.startTurn, editingRecord.endTurn) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\xB7" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dcf-file-chip", title: editingRecord.relativePath, children: cleanFileLabel(editingRecord) })
        ] }),
        editorMode === "fold" && !isEditingActiveInSurface && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dcf-banner dcf-banner-info", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dcf-banner-text", children: "\u8BE5\u6863\u6848\u5DF2\u88AB\u540E\u7EED\u538B\u7F29\u5408\u5E76\uFF0C\u5F53\u524D\u4EC5\u652F\u6301\u7F16\u8F91\u4FDD\u5B58\u78C1\u76D8\u6587\u4EF6\u3002" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-label", style: { marginTop: 4 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u6CE8\u5165\u4E3B\u7EBF\u7684\u7CBE\u534E" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dcf-tag", children: [
            "~",
            formatCompact(estimateTokens(editSummary)),
            " tok"
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-running-host", style: { borderRadius: 8 }, children: [
          busy && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(RunningBorder, { radius: 8, color: "#0d9488" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "textarea",
            {
              className: "dcf-textarea",
              rows: 11,
              value: editSummary,
              onChange: (e) => setEditSummary(e.target.value),
              placeholder: "\u8FD9\u6BB5\u7CBE\u70BC\u5185\u5BB9\u5C06\u66FF\u6362\u539F\u533A\u95F4\u8FDB\u5165\u6A21\u578B\u4E0A\u4E0B\u6587\u2026"
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-row", style: { justifyContent: "space-between", marginTop: 2 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
            "button",
            {
              type: "button",
              className: "dcf-disclosure",
              onClick: () => setShowDetails((v) => !v),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(IconChevron, { open: showDetails }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u8BE6\u7EC6\u590D\u76D8\u4E0E\u6570\u636E\uFF08\u4E0D\u5360\u4E0A\u4E0B\u6587\uFF09" })
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
            "button",
            {
              type: "button",
              className: "dcf-btn dcf-btn-ghost",
              disabled: busy,
              onClick: () => void openEditorForRecord(editingRecord, editorMode),
              title: "\u653E\u5F03\u5F53\u524D\u6846\u5185\u4FEE\u6539\uFF0C\u91CD\u65B0\u4ECE\u786C\u76D8\u8BFB\u53D6\u6700\u65B0\u6587\u4EF6\u5185\u5BB9",
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(IconRefresh, { size: 12 }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u91CD\u8F7D\u78C1\u76D8" })
              ]
            }
          )
        ] }),
        showDetails && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "textarea",
          {
            className: "dcf-textarea dcf-textarea-mono",
            rows: 12,
            value: editDetails,
            onChange: (e) => setEditDetails(e.target.value)
          }
        )
      ] })
    ] }),
    view === "map" && selectedStats && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-footer dcf-running-host", children: [
      busy && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(RunningBorder, { radius: 0 }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-turn-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dcf-metric", children: [
          "\u5DF2\u9009 ",
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: selectedStats.label }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dcf-hint", children: [
            "\uFF08",
            selectedStats.activeTurns,
            " \u8F6E",
            selectedStats.segmentCount > 1 ? ` \xB7 ${selectedStats.segmentCount} \u6BB5` : "",
            "\uFF09"
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dcf-tag dcf-tag-warn", children: [
          "\u7EA6 ",
          formatCompact(selectedStats.tokens),
          " tok"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "input",
        {
          className: "dcf-input",
          placeholder: "\u53EF\u9009\uFF1A\u4E3A\u8FD9\u6B21\u6298\u51FA\u8D77\u4E2A\u540D\u5B57\uFF08\u5982\uFF1A\u67D0\u80A1\u624B\u6CD5\u9A8C\u8BC1\uFF09",
          value: foldTitle,
          onChange: (e) => setFoldTitle(e.target.value)
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            ref: primaryActionRef,
            type: "button",
            className: "dcf-btn dcf-btn-primary",
            style: { flex: 1 },
            disabled: busy || selectedStats.activeTurns === 0,
            onClick: () => void handlePrepare(),
            children: busy ? "\u6B63\u5728\u63D0\u70BC\u9884\u89C8\u2026" : "\u751F\u6210\u53CC\u5C42\u63D0\u70BC\u9884\u89C8"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            type: "button",
            className: "dcf-btn dcf-btn-ghost",
            disabled: busy,
            onClick: () => {
              setSelectedTurns([]);
              lastClickedTurnRef.current = null;
            },
            children: "\u6E05\u7A7A"
          }
        )
      ] })
    ] }),
    view === "editor" && editingRecord && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dcf-footer dcf-running-host", children: [
      busy && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(RunningBorder, { radius: 0, color: editorMode === "draft" ? "#4d6bfe" : "#0d9488" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dcf-row", children: editorMode === "draft" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            ref: primaryActionRef,
            type: "button",
            className: "dcf-btn dcf-btn-primary",
            style: { flex: 1 },
            disabled: busy || !snap?.isIdle,
            onClick: () => void handleApplyDraft(),
            children: busy ? "\u6B63\u5728\u66FF\u6362\u4E0A\u4E0B\u6587\u2026" : "\u786E\u8BA4\u6298\u51FA\u5E76\u66FF\u6362\u4E0A\u4E0B\u6587"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            type: "button",
            className: "dcf-btn dcf-btn-danger",
            disabled: busy,
            onClick: () => void handleDiscardDraft(editingRecord.foldId),
            children: "\u4E22\u5F03"
          }
        )
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        isEditingActiveInSurface ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            ref: primaryActionRef,
            type: "button",
            className: "dcf-btn dcf-btn-primary",
            style: { flex: 1 },
            disabled: busy || !snap?.isIdle,
            onClick: () => void handleSyncFold(),
            children: busy ? "\u540C\u6B65\u4E2D\u2026" : "\u4FDD\u5B58\u5E76\u539F\u5730\u540C\u6B65"
          }
        ) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            ref: primaryActionRef,
            type: "button",
            className: "dcf-btn dcf-btn-primary",
            style: { flex: 1 },
            disabled: busy,
            onClick: () => void handleSaveFileOnly(),
            children: busy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4EC5\u4FDD\u5B58\u6863\u6848\u6587\u4EF6"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "button",
          {
            type: "button",
            className: "dcf-btn dcf-btn-ghost",
            onClick: () => handleOpenExternalFile(editingRecord),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(IconFile, {}),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u539F\u6587\u4EF6" })
            ]
          }
        )
      ] }) })
    ] })
  ] });
}

// src/client/index.jsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var inject = ["slots", "sidebarRightTabs", "sidebarRight"];
function FoldTabTitle({ useTabInfo }) {
  const { tab } = useTabInfo();
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: tab.title || "\u4E0A\u4E0B\u6587\u6298\u51FA" });
}
function FoldIcon({ size = 15 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M4 7h16" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M4 17h16" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "m9 11 3 3 3-3" })
      ]
    }
  );
}
function apply(ctx) {
  ctx.effect(
    () => ctx.sidebarRightTabs.register({
      id: PLUGIN_ID,
      kind: SIDEBAR_TAB_KIND,
      priority: "extension",
      title: () => "\u4E0A\u4E0B\u6587\u6298\u51FA",
      guide: [
        {
          id: SIDEBAR_TAB_KIND,
          order: 35,
          title: () => "\u4E0A\u4E0B\u6587\u6298\u51FA",
          description: () => "\u67E5\u770B\u6BCF\u8F6E Token \u5360\u6BD4\u3001\u5C40\u90E8\u6298\u51FA\u4E3A\u53EF\u7F16\u8F91\u6863\u6848\u5E76\u540C\u6B65\u56DE\u4E0A\u4E0B\u6587"
        }
      ]
    }),
    "dsh-context-fold: sidebar tab type"
  );
  ctx.effect(
    () => ctx.slots.inject(
      "sidebar.right.pane.tab",
      () => ctx.slots.register(
        {
          name: "sidebar.right.pane.tab",
          key: PLUGIN_ID
        },
        FoldPanel
      )
    ),
    "dsh-context-fold: sidebar tab body"
  );
  ctx.effect(
    () => ctx.slots.inject(
      "sidebar.right.pane.tab.title",
      () => ctx.slots.register(
        {
          name: "sidebar.right.pane.tab.title",
          key: PLUGIN_ID
        },
        FoldTabTitle
      )
    ),
    "dsh-context-fold: sidebar tab title"
  );
  try {
    const HeaderButton = () => {
      ensureStyles();
      return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
        "button",
        {
          type: "button",
          className: "dcf-header-trigger",
          title: "\u6253\u5F00\u4E0A\u4E0B\u6587\u5C40\u90E8\u6298\u51FA\u9762\u677F",
          onClick: () => {
            try {
              ctx.sidebarRight.openTab(SIDEBAR_TAB_KIND);
            } catch {
            }
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(FoldIcon, { size: 14 }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: "\u6298\u51FA" })
          ]
        }
      );
    };
    ctx.effect(
      () => ctx.slots.inject(
        "conversation.session.header.utilities",
        () => ctx.slots.register(
          {
            name: "conversation.session.header.utilities",
            id: PLUGIN_ID,
            order: 60
          },
          HeaderButton
        )
      ),
      "dsh-context-fold: header button"
    );
  } catch {
  }
}

    return module.exports;
  }
});
