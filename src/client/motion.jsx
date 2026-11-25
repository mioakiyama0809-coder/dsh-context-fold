import React, { useCallback, useEffect, useRef, useState } from "react";

/**
 * Restrained streamline motion primitives inspired by Lancer's `@lancer/light-ui`:
 * 1. `RunningBorder`: 1.2px orbiting hairline border mounted only while distilling / syncing.
 * 2. `useStreamlineFlights`: cubic-Bezier light-trail + expanding landing ripple on fold / sync.
 */

const FLIGHT_SECONDS = 0.9;
const LANDING_SECONDS = 0.55;

const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));
const segment = (v, a, b) => clamp((v - a) / (b - a));
const smoothstep = (t) => t * t * (3 - 2 * t);
const outEase = (t) => 1 - Math.pow(1 - clamp(t), 3);

function cubicPoint(pts, t) {
  const [a, c1, c2, b] = pts;
  const q = 1 - t;
  return {
    x: q * q * q * a.x + 3 * q * q * t * c1.x + 3 * q * t * t * c2.x + t * t * t * b.x,
    y: q * q * q * a.y + 3 * q * q * t * c1.y + 3 * q * t * t * c2.y + t * t * t * b.y,
  };
}

function cubicPath([a, c1, c2, b]) {
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

function flightControls(a, b, seed = 0.35) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const amp = Math.min(140, Math.max(36, len * (0.18 + (seed % 0.14))));
  const dir = seed >= 0.5 ? 1 : -1;
  const ctrl = (frac, bend) => ({
    x: a.x + dx * frac - (dy / len) * bend,
    y: a.y + dy * frac + (dx / len) * bend,
  });
  return [ctrl(0.28, dir * amp), ctrl(0.68, dir * amp * 0.72)];
}

function approxArcLength(pts, endT) {
  let len = 0;
  let prev = pts[0];
  const steps = 40;
  for (let i = 1; i <= steps; i++) {
    const next = cubicPoint(pts, (endT * i) / steps);
    len += Math.hypot(next.x - prev.x, next.y - prev.y);
    prev = next;
  }
  return len;
}

function prefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Restrained 1.2px orbiting hairline border (Lancer RunningBorder).
 * Mount inside a `position: relative` container only while an async operation runs.
 */
export function RunningBorder({ radius = 8, color }) {
  return (
    <svg
      className="dcf-running-border"
      style={color ? { "--dcf-light-color": color } : undefined}
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="1"
        y="1"
        width="calc(100% - 2px)"
        height="calc(100% - 2px)"
        rx={radius}
        pathLength="100"
      />
    </svg>
  );
}

/**
 * Hook returning `{ launchFlight, FlightOverlay }`.
 * Zero overhead when idle: the fixed SVG overlay mounts and runs rAF only during active flights.
 */
export function useStreamlineFlights() {
  const flightsRef = useRef([]);
  const [hasActive, setHasActive] = useState(false);
  const svgRef = useRef(null);
  const rafRef = useRef(0);
  const serialRef = useRef(1);

  const renderFrame = useCallback(() => {
    rafRef.current = 0;
    const svg = svgRef.current;
    const now = performance.now();
    const alive = [];

    for (const f of flightsRef.current) {
      const age = (now - f.startedAt) / 1000;
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

          // Soft double halo (exact Lancer light-ui recipe)
          for (const [w, op] of [
            [6, 0.08 * fadeOut],
            [2.6, 0.15 * fadeOut],
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

          // Core gradient beam
          const core = document.createElementNS(ns, "path");
          core.setAttribute("d", f.d);
          core.setAttribute("fill", "none");
          core.setAttribute("stroke", `url(#${gradId})`);
          core.setAttribute("stroke-linecap", "round");
          core.setAttribute("stroke-width", "1.4");
          core.setAttribute("stroke-dasharray", dash);
          core.setAttribute("stroke-dashoffset", (-startLen).toFixed(1));
          g.appendChild(core);

          // Luminous head dot + halo
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

        // Expanding landing ripple right as the head reaches destination
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

  useEffect(() => {
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

  const launchFlight = useCallback(
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
        startedAt: performance.now(),
      });
      setHasActive(true);
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(renderFrame);
      }
    },
    [renderFrame]
  );

  const FlightOverlay = hasActive ? (
    <svg ref={svgRef} className="dcf-flight-overlay" aria-hidden="true" focusable="false" />
  ) : null;

  return { launchFlight, FlightOverlay };
}
