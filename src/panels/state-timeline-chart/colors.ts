/**
 * How healthy a state is. It picks the default colour of a state without an explicit mapping
 * colour, and orders rows for `sorting: worst`.
 */
export type Severity = "error" | "warning" | "neutral" | "ok";

/**
 * Default severity of common state strings, compared case-insensitively. They cover Kubernetes
 * conditions and pod phases, Flux readiness and reasons, and usual health words.
 */
const DEFAULT_SEVERITY: Record<string, Severity> = {};
for (const s of [
  "true",
  "ready",
  "running",
  "available",
  "succeeded",
  "healthy",
  "up",
  "ok",
  "active",
  "complete",
  "completed",
  "reconciliationsucceeded",
])
  DEFAULT_SEVERITY[s] = "ok";
for (const s of [
  "false",
  "failed",
  "failure",
  "error",
  "crashloopbackoff",
  "imagepullbackoff",
  "errimagepull",
  "oomkilled",
  "degraded",
  "unhealthy",
  "down",
  "critical",
  "reconciliationfailed",
  "healthcheckfailed",
  "buildfailed",
  "artifactfailed",
  "dependencynotready",
])
  DEFAULT_SEVERITY[s] = "error";
for (const s of [
  "unknown",
  "reconciling",
  "progressing",
  "pending",
  "warning",
  "waiting",
  "terminating",
  "containercreating",
  "progressingwithretry",
])
  DEFAULT_SEVERITY[s] = "warning";

/** Severity from the state text alone, when it is one of the common strings. */
export function severityOfText(state: string): Severity | undefined {
  return DEFAULT_SEVERITY[state.trim().toLowerCase()];
}

/** `rrggbb` for a `#rgb` or `#rrggbb` colour, else undefined. */
function hex6(color: string): string | undefined {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m || !m[1]) return undefined;
  return m[1].length === 3
    ? m[1]
        .split("")
        .map((c) => c + c)
        .join("")
    : m[1];
}

/** Hue in degrees and saturation (0..1) of a `#rgb` or `#rrggbb` colour. */
function hueOf(color: string): { hue: number; saturation: number } | undefined {
  const hex = hex6(color);
  if (!hex) return undefined;
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
  }
  hue = (hue * 60 + 360) % 360;
  return { hue, saturation };
}

/**
 * Severity of a state: from an explicit mapping colour when there is one (red, amber or green
 * hues), else from the state text, else neutral.
 */
export function severityOf(state: string, mappedColor?: string): Severity {
  if (mappedColor) {
    const h = hueOf(mappedColor);
    if (h && h.saturation >= 0.2) {
      if (h.hue < 20 || h.hue >= 330) return "error";
      if (h.hue < 70) return "warning";
      if (h.hue < 170) return "ok";
    }
    return "neutral";
  }
  return severityOfText(state) ?? "neutral";
}

export const SEVERITY_RANK: Record<Severity, number> = {
  error: 0,
  warning: 1,
  neutral: 2,
  ok: 3,
};

/** A stable index into a palette for a state, so a state keeps its colour across refreshes. */
export function paletteIndex(state: string, size: number): number {
  let hash = 2166136261;
  for (let i = 0; i < state.length; i++) {
    hash ^= state.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return size > 0 ? (hash >>> 0) % size : 0;
}

/** Black or white, whichever reads better on the given background. */
export function contrastText(background: string): string {
  const hex = hex6(background);
  if (!hex) return "#ffffff";
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const luminance =
    0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return luminance > 0.4 ? "#000000" : "#ffffff";
}
