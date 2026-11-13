import {
  ValueMapping,
  applyValueMapping,
  createRegexFromString,
  formatValue,
} from "@perses-dev/components";
import { PanelData } from "@perses-dev/plugin-system";
import { TimeSeries, TimeSeriesData } from "@perses-dev/spec";
import {
  DEFAULT_MERGE_GAP_FACTOR,
  RowSorting,
  StateMode,
} from "./state-timeline-chart-types";
import { SEVERITY_RANK, Severity, severityOf } from "./colors";

/** One state of one row, from its first sample to the start of the next state (or a gap). */
export interface StateBand {
  row: number;
  start: number;
  end: number;
  /** Display text of the state. */
  state: string;
}

export interface TimelineRow {
  name: string;
  /** Number of times the row switched from one state to another (gaps do not count). */
  changes: number;
  /** State of the row's latest band. */
  latest?: string;
}

export interface StateInfo {
  state: string;
  /** Colour from a value mapping, when one set it. */
  mappedColor?: string;
  severity: Severity;
}

export interface TimelineModel {
  rows: TimelineRow[];
  bands: StateBand[];
  /** Every state that occurs, by display text. */
  states: Map<string, StateInfo>;
}

export interface TimelineInput {
  mode: StateMode;
  rowLabels: string[];
  stateLabel: string;
  mappings: ValueMapping[];
  sorting?: RowSorting;
  mergeGapFactor?: number;
  /** End of the dashboard time range: the latest band of a row never reaches past it. */
  endMs?: number;
}

/** One sample of a row: its state, or null when the row is known to be in no state. */
type Point = [number, string | null];

interface Track {
  name: string;
  points: Point[];
  stepMs: number;
}

const FALLBACK_STEP_MS = 60_000;

/** True when `mapping` matches `value`, with the same rules as Perses' `applyValueMapping`. */
function mappingMatches(
  mapping: ValueMapping,
  value: string | number,
): boolean {
  switch (mapping.kind) {
    case "Value":
      return String(mapping.spec.value) === String(value);
    case "Range": {
      const { from, to } = mapping.spec;
      if (from === undefined && to === undefined) return false;
      const n = typeof value === "number" ? value : Number(value);
      if (typeof value === "string" && value.trim() === "") return false;
      return n >= (from ?? -Infinity) && n <= (to ?? Infinity);
    }
    case "Regex":
      return (
        !!mapping.spec.pattern &&
        createRegexFromString(mapping.spec.pattern).test(String(value))
      );
    case "Misc":
      switch (mapping.spec.value) {
        case "empty":
          return value === "";
        case "NaN":
          return typeof value === "number" && Number.isNaN(value);
        default:
          return false;
      }
    default:
      return false;
  }
}

/** Index of the first mapping that matches, or Infinity. Earlier mappings have higher priority. */
function mappingPriority(value: string, mappings: ValueMapping[]): number {
  const i = mappings.findIndex((m) => mappingMatches(m, value));
  return i === -1 ? Infinity : i;
}

/** Step of a query result: its `stepMs`, else the smallest gap between two samples. */
function stepOf(data: TimeSeriesData): number {
  if (data.stepMs && data.stepMs > 0) return data.stepMs;
  let step = Infinity;
  for (const s of data.series) {
    for (let i = 1; i < s.values.length; i++) {
      const d = s.values[i]![0] - s.values[i - 1]![0];
      if (d > 0 && d < step) step = d;
    }
  }
  return Number.isFinite(step) ? step : FALLBACK_STEP_MS;
}

function seriesName(series: TimeSeries): string {
  return series.formattedName || series.name || "";
}

/** Rows of value mode: one per series, the state is the (mapped) sample value. */
function valueTracks(
  queryResults: Array<PanelData<TimeSeriesData>>,
  resolve: (raw: string | number) => string,
): Track[] {
  const tracks: Track[] = [];
  for (const { data } of queryResults) {
    if (!data?.series) continue;
    const stepMs = stepOf(data);
    for (const series of data.series) {
      const points: Point[] = [];
      for (const [t, v] of series.values) {
        if (v === null || v === undefined) continue;
        points.push([t, resolve(v)]);
      }
      tracks.push({ name: seriesName(series), points, stepMs });
    }
  }
  return tracks;
}

/** Row key and name of a series in label mode. */
function rowIdentity(
  series: TimeSeries,
  rowLabels: string[],
  stateLabel: string,
): { key: string; name: string } {
  const labels = series.labels ?? {};
  if (rowLabels.length > 0) {
    const values = rowLabels.map((l) => labels[l] ?? "");
    return { key: JSON.stringify(values), name: values.join(" / ") };
  }
  const pairs = Object.entries(labels)
    .filter(([k]) => k !== stateLabel && k !== "__name__")
    .sort(([a], [b]) => a.localeCompare(b));
  return {
    key: JSON.stringify(pairs),
    name: pairs.length
      ? `{${pairs.map(([k, v]) => `${k}="${v}"`).join(", ")}}`
      : (labels["__name__"] ?? seriesName(series)),
  };
}

/**
 * Rows of label mode. Series are grouped into rows by `rowLabels`. At each timestamp the row's
 * state is the `stateLabel` value of its series whose sample is non-zero. When several are, the one
 * whose value mapping comes first wins; when none of them is mapped, they are joined with " + ".
 * A timestamp where every series of the row is zero is a known "no state", which ends the band.
 */
function labelTracks(
  queryResults: Array<PanelData<TimeSeriesData>>,
  rowLabels: string[],
  stateLabel: string,
  mappings: ValueMapping[],
  resolve: (raw: string | number) => string,
  combine: (states: string[]) => string,
): Track[] {
  const groups = new Map<
    string,
    { name: string; stepMs: number; samples: Map<number, Set<string>> }
  >();
  for (const { data } of queryResults) {
    if (!data?.series) continue;
    const stepMs = stepOf(data);
    for (const series of data.series) {
      const state = series.labels?.[stateLabel];
      if (state === undefined) continue;
      const { key, name } = rowIdentity(series, rowLabels, stateLabel);
      let group = groups.get(key);
      if (!group) {
        group = { name, stepMs, samples: new Map() };
        groups.set(key, group);
      }
      group.stepMs = Math.min(group.stepMs, stepMs);
      for (const [t, v] of series.values) {
        if (v === null || v === undefined || Number.isNaN(v)) continue;
        let states = group.samples.get(t);
        if (!states) {
          states = new Set();
          group.samples.set(t, states);
        }
        if (v !== 0) states.add(state);
      }
    }
  }

  const tracks: Track[] = [];
  for (const { name, stepMs, samples } of groups.values()) {
    const points: Point[] = [];
    for (const [t, states] of samples) {
      if (states.size === 0) {
        points.push([t, null]);
        continue;
      }
      const list = [...states];
      let state: string;
      if (list.length === 1) {
        state = resolve(list[0]!);
      } else {
        const ranked = list
          .map((s) => ({ s, p: mappingPriority(s, mappings) }))
          .sort((a, b) => a.p - b.p || a.s.localeCompare(b.s));
        state = Number.isFinite(ranked[0]!.p)
          ? resolve(ranked[0]!.s)
          : combine(ranked.map((r) => resolve(r.s)));
      }
      points.push([t, state]);
    }
    points.sort((a, b) => a[0] - b[0]);
    tracks.push({ name, points, stepMs });
  }
  return tracks;
}

/**
 * Merges consecutive samples with the same state into bands. A band runs from its first sample to
 * the first sample of the next state. A gap longer than `gapFactor` steps, or a sample with no
 * state, ends it; a band that ends at a gap covers one step after its last sample.
 */
function trackBands(
  track: Track,
  row: number,
  gapFactor: number,
  endMs: number | undefined,
): StateBand[] {
  const bands: StateBand[] = [];
  const maxGap = track.stepMs * gapFactor;
  const clamp = (t: number): number =>
    endMs === undefined ? t : Math.min(t, endMs);
  let current: { state: string; start: number; last: number } | undefined;

  const close = (end: number): void => {
    if (!current) return;
    bands.push({
      row,
      start: current.start,
      end: Math.max(current.start, end),
      state: current.state,
    });
    current = undefined;
  };

  for (const [t, state] of track.points) {
    if (current && t - current.last > maxGap) {
      close(clamp(current.last + track.stepMs));
    }
    if (state === null) {
      close(t);
      continue;
    }
    if (current && current.state === state) {
      current.last = t;
      continue;
    }
    close(t);
    current = { state, start: t, last: t };
  }
  if (current) close(clamp(current.last + track.stepMs));
  return bands;
}

function sortRows(
  rows: Array<TimelineRow & { bands: StateBand[] }>,
  sorting: RowSorting | undefined,
  states: Map<string, StateInfo>,
): void {
  const byName = (a: TimelineRow, b: TimelineRow): number =>
    a.name.localeCompare(b.name, undefined, { numeric: true });
  const rank = (r: TimelineRow): number =>
    r.latest === undefined
      ? SEVERITY_RANK.neutral
      : SEVERITY_RANK[states.get(r.latest)?.severity ?? "neutral"];
  switch (sorting) {
    case "asc":
      rows.sort(byName);
      break;
    case "desc":
      rows.sort((a, b) => byName(b, a));
      break;
    case "worst":
      rows.sort(
        (a, b) => rank(a) - rank(b) || b.changes - a.changes || byName(a, b),
      );
      break;
    case "changes":
      rows.sort((a, b) => b.changes - a.changes || byName(a, b));
      break;
    default:
      break;
  }
}

/** Turns query results into rows of state bands. */
export function buildTimeline(
  queryResults: Array<PanelData<TimeSeriesData>>,
  input: TimelineInput,
): TimelineModel {
  const states = new Map<string, StateInfo>();
  const resolve = (raw: string | number): string => {
    const mapped = applyValueMapping(raw, input.mappings);
    const matched = input.mappings.some((m) => mappingMatches(m, raw));
    let state: string;
    if (matched || typeof mapped.value === "string") {
      state = String(mapped.value);
    } else {
      state = Number.isNaN(mapped.value)
        ? "NaN"
        : formatValue(mapped.value, { unit: "decimal" });
    }
    if (!states.has(state)) {
      states.set(state, {
        state,
        mappedColor: mapped.color,
        severity: severityOf(state, mapped.color),
      });
    }
    return state;
  };
  // Several unmapped states at once: one combined state, as severe as the worst of them.
  const combine = (parts: string[]): string => {
    const state = parts.join(" + ");
    if (!states.has(state)) {
      const severity = parts
        .map((p) => states.get(p)?.severity ?? "neutral")
        .reduce((a, b) => (SEVERITY_RANK[b] < SEVERITY_RANK[a] ? b : a));
      states.set(state, { state, severity });
    }
    return state;
  };

  const tracks =
    input.mode === "label"
      ? labelTracks(
          queryResults,
          input.rowLabels,
          input.stateLabel,
          input.mappings,
          resolve,
          combine,
        )
      : valueTracks(queryResults, resolve);

  const gapFactor =
    input.mergeGapFactor && input.mergeGapFactor > 0
      ? input.mergeGapFactor
      : DEFAULT_MERGE_GAP_FACTOR;

  const rows = tracks.map((track) => {
    const bands = trackBands(track, 0, gapFactor, input.endMs);
    let changes = 0;
    for (let i = 1; i < bands.length; i++) {
      const prev = bands[i - 1]!;
      const band = bands[i]!;
      if (prev.end === band.start && prev.state !== band.state) changes++;
    }
    return {
      name: track.name,
      changes,
      latest: bands[bands.length - 1]?.state,
      bands,
    };
  });

  sortRows(rows, input.sorting, states);

  const bands: StateBand[] = [];
  rows.forEach((row, index) => {
    for (const band of row.bands) bands.push({ ...band, row: index });
  });

  // Only states that are drawn: a state seen only in a dropped sample would clutter the legend.
  const used = new Map<string, StateInfo>();
  for (const band of bands) {
    const info = states.get(band.state);
    if (info && !used.has(band.state)) used.set(band.state, info);
  }

  return {
    rows: rows.map(({ name, changes, latest }) => ({ name, changes, latest })),
    bands,
    states: used,
  };
}
