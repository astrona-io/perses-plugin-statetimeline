import { TimeSeriesData } from "@perses-dev/spec";
import { ValueMapping } from "@perses-dev/components";
import {
  LegendSpecOptions,
  OptionsEditorProps,
  PanelProps,
} from "@perses-dev/plugin-system";

export type QueryData = TimeSeriesData;

export type StateTimelineChartProps = PanelProps<
  StateTimelineChartOptions,
  QueryData
>;
export type StateTimelineChartEditorProps =
  OptionsEditorProps<StateTimelineChartOptions>;

/**
 * Where a row's state comes from.
 *
 * - `value`: each series is a row and each sample value is the state (through the value mappings).
 * - `label`: series are grouped into rows by `rowLabels`; the state at a timestamp is the value of
 *   `stateLabel` on the series of that row whose sample is non-zero.
 */
export type StateMode = "value" | "label";

/**
 * Row order. Unset keeps the query order.
 *
 * - `asc` / `desc`: by row name.
 * - `worst`: rows whose latest state is an error first, then warning, then neutral, then healthy;
 *   ties go to the row with more state changes, then by name.
 * - `changes`: rows with the most state changes in the time range first, then by name.
 */
export type RowSorting = "asc" | "desc" | "worst" | "changes";

export interface StateTimelineChartOptions {
  /** Default `value`. */
  mode?: StateMode;
  /** Label mode: labels that identify a row. Empty: every label except `stateLabel` and `__name__`. */
  rowLabels?: string[];
  /** Label mode: label whose value is the state. */
  stateLabel?: string;
  /** Map values (value mode) or label values (label mode) to a display text and a colour. */
  mappings?: ValueMapping[];
  /** Legend of the states and their colours. Hidden when unset. */
  legend?: LegendSpecOptions;
  /** Row order. Unset keeps the query order. */
  sorting?: RowSorting;
  /** Height of each row in pixels. Unset: rows share the panel height, at least 20 px each. */
  rowHeight?: number;
  /** Write the state inside a band when it is wide enough. Default true. */
  showValues?: boolean;
  /**
   * A gap between two samples longer than this many query steps ends the band and leaves the time
   * between them empty (no data). Default 2.
   */
  mergeGapFactor?: number;
}

export const DEFAULT_MODE: StateMode = "value";
export const DEFAULT_MERGE_GAP_FACTOR = 2;
export const MIN_ROW_HEIGHT = 20;

export function createInitialStateTimelineChartOptions(): StateTimelineChartOptions {
  return {
    mode: DEFAULT_MODE,
    showValues: true,
    legend: { position: "bottom" },
  };
}

export const SORTING_LABELS: Record<RowSorting | "none", string> = {
  none: "Query order",
  asc: "Name, ascending",
  desc: "Name, descending",
  worst: "Worst state first",
  changes: "Most state changes first",
};
