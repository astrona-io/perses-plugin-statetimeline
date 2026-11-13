import { ReactElement, useCallback, useMemo } from "react";
import { Box, useTheme } from "@mui/material";
import {
  ContentWithLegend,
  EChart,
  LegendItem,
  NoDataOverlay,
  TextOverlay,
  useChartsTheme,
  useTimeZone,
} from "@perses-dev/components";
import { useTimeRange, validateLegendSpec } from "@perses-dev/plugin-system";
import type {
  CustomSeriesRenderItemAPI,
  CustomSeriesRenderItemParams,
  CustomSeriesRenderItemReturn,
  EChartsCoreOption,
} from "echarts";
import {
  DEFAULT_MODE,
  MIN_ROW_HEIGHT,
  StateTimelineChartProps,
} from "./state-timeline-chart-types";
import { StateBand, StateInfo, buildTimeline } from "./data";
import { contrastText, paletteIndex } from "./colors";

/** Height of the time axis, labels included. */
const AXIS_HEIGHT = 28;
/** Space between the rows and the panel edge opposite the time axis. */
const GRID_PAD = 4;
/** Space right of the plot, so the last time label is not cut off. */
const GRID_RIGHT = 24;
/** Share of a row's height the band fills. */
const BAND_FILL = 0.8;
/** Rows are no taller than this when they share the panel height. */
const MAX_AUTO_ROW_HEIGHT = 48;
/** Room for the scrollbar when the rows do not fit. */
const SCROLLBAR_WIDTH = 12;
const LABEL_FONT_SIZE = 11;
/** Rough width of one character of the axis labels, to size the row-name column. */
const CHAR_WIDTH = 6.5;
/** A band gets its state written inside once it is at least this wide (px). */
const MIN_TEXT_WIDTH = 24;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** `1d 4h`, `5m 12s`, `800ms`: the two largest units. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const units: Array<[string, number]> = [
    ["d", 86_400_000],
    ["h", 3_600_000],
    ["m", 60_000],
    ["s", 1000],
  ];
  const parts: string[] = [];
  let rest = ms;
  let taken = 0;
  for (const [unit, size] of units) {
    const n = Math.floor(rest / size);
    rest -= n * size;
    if (taken === 0 && n === 0) continue;
    if (n > 0) parts.push(`${n}${unit}`);
    if (++taken === 2) break;
  }
  return parts.join(" ");
}

/** Date format of the time axis for a time range of the given length. */
function axisFormat(rangeMs: number): string {
  if (rangeMs <= 10 * 60_000) return "HH:mm:ss";
  if (rangeMs <= 36 * 3_600_000) return "HH:mm";
  if (rangeMs <= 7 * 86_400_000) return "MM/dd HH:mm";
  return "yyyy-MM-dd";
}

export function StateTimelineChartComponent(
  props: StateTimelineChartProps,
): ReactElement | null {
  const { queryResults, spec, contentDimensions } = props;
  const muiTheme = useTheme();
  const chartsTheme = useChartsTheme();
  const { absoluteTimeRange } = useTimeRange();
  const { formatWithUserTimeZone } = useTimeZone();
  const formatTime = useCallback(
    (ms: number, format: string): string =>
      formatWithUserTimeZone(new Date(ms), format),
    [formatWithUserTimeZone],
  );

  const mode = spec.mode ?? DEFAULT_MODE;
  const stateLabel = spec.stateLabel?.trim() ?? "";
  const showValues = spec.showValues ?? true;
  const startMs = absoluteTimeRange.start.getTime();
  const endMs = absoluteTimeRange.end.getTime();

  const model = useMemo(
    () =>
      buildTimeline(queryResults, {
        mode,
        rowLabels: (spec.rowLabels ?? []).filter((l) => l.trim() !== ""),
        stateLabel,
        mappings: spec.mappings ?? [],
        sorting: spec.sorting,
        mergeGapFactor: spec.mergeGapFactor,
        endMs,
      }),
    [
      queryResults,
      mode,
      spec.rowLabels,
      stateLabel,
      spec.mappings,
      spec.sorting,
      spec.mergeGapFactor,
      endMs,
    ],
  );

  /** Colour of every state: mapping colour, else by severity, else a stable palette colour. */
  const colors = useMemo(() => {
    const palette = (chartsTheme.echartsTheme.color as
      string[] | undefined) ?? [muiTheme.palette.primary.main];
    const bySeverity = {
      ok: muiTheme.palette.success.main,
      warning: muiTheme.palette.warning.main,
      error: muiTheme.palette.error.main,
    };
    const colorOf = (info: StateInfo): string => {
      if (info.mappedColor) return info.mappedColor;
      if (info.severity !== "neutral") return bySeverity[info.severity];
      return (
        palette[paletteIndex(info.state, palette.length)] ??
        muiTheme.palette.primary.main
      );
    };
    const colors = new Map<string, string>();
    for (const info of model.states.values())
      colors.set(info.state, colorOf(info));
    return colors;
  }, [model.states, chartsTheme, muiTheme]);

  const legend = useMemo(
    () =>
      spec.legend && validateLegendSpec(spec.legend) ? spec.legend : undefined,
    [spec.legend],
  );
  const legendItems: LegendItem[] = useMemo(
    () =>
      [...colors.entries()]
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
        .map(([state, color]) => ({ id: state, label: state, color })),
    [colors],
  );

  if (!contentDimensions) return null;

  if (mode === "label" && stateLabel === "") {
    return <TextOverlay message="Set a state label in the panel settings" />;
  }
  if (model.bands.length === 0) {
    return <NoDataOverlay resource="data" />;
  }

  const padding = chartsTheme.container.padding.default;
  const width = Math.max(0, contentDimensions.width - padding * 2);
  const height = Math.max(0, contentDimensions.height - padding * 2);

  return (
    <Box sx={{ padding: `${padding}px` }}>
      <ContentWithLegend
        width={width}
        height={height}
        legendSize={legend?.size}
        legendProps={
          legend && {
            options: legend,
            data: legendItems,
            selectedItems: "ALL",
            onSelectedItemsChange: () => null,
          }
        }
      >
        {({ width, height }) => (
          <TimelineChart
            width={width}
            height={height}
            rows={model.rows.map((r) => r.name)}
            bands={model.bands}
            colors={colors}
            startMs={startMs}
            endMs={endMs}
            rowHeight={spec.rowHeight}
            showValues={showValues}
            formatTime={formatTime}
          />
        )}
      </ContentWithLegend>
    </Box>
  );
}

interface TimelineChartProps {
  width: number;
  height: number;
  rows: string[];
  bands: StateBand[];
  colors: Map<string, string>;
  startMs: number;
  endMs: number;
  rowHeight?: number;
  showValues: boolean;
  formatTime: (ms: number, format: string) => string;
}

function TimelineChart(props: TimelineChartProps): ReactElement {
  const {
    width,
    height,
    rows,
    bands,
    colors,
    startMs,
    endMs,
    rowHeight,
    showValues,
    formatTime,
  } = props;
  const muiTheme = useTheme();
  const chartsTheme = useChartsTheme();

  const fixedRow = rowHeight && rowHeight > 0 ? rowHeight : undefined;
  const autoRow = Math.min(
    MAX_AUTO_ROW_HEIGHT,
    Math.max(
      MIN_ROW_HEIGHT,
      Math.floor((height - AXIS_HEIGHT - GRID_PAD) / Math.max(1, rows.length)),
    ),
  );
  const row = fixedRow ?? autoRow;
  const chartHeight = Math.ceil(rows.length * row + AXIS_HEIGHT + GRID_PAD);
  // Too many rows: the panel scrolls and the time axis moves to the top, where it stays readable.
  const scrolls = chartHeight > height;
  const chartWidth = Math.max(0, width - (scrolls ? SCROLLBAR_WIDTH : 0));

  const option = useMemo((): EChartsCoreOption => {
    const text = muiTheme.palette.text;
    const longest = rows.reduce((n, r) => Math.max(n, r.length), 0);
    const labelWidth = Math.round(
      Math.min(chartWidth * 0.4, Math.max(40, longest * CHAR_WIDTH)),
    );
    const timeFormat = axisFormat(endMs - startMs);
    const fullFormat = "yyyy-MM-dd HH:mm:ss";

    const renderItem = (
      params: CustomSeriesRenderItemParams,
      api: CustomSeriesRenderItemAPI,
    ): CustomSeriesRenderItemReturn => {
      const band = bands[params.dataIndex];
      if (!band) return null;
      const rowIndex = api.value(0) as number;
      const from = api.coord([api.value(1), rowIndex]);
      const to = api.coord([api.value(2), rowIndex]);
      const size = api.size?.([0, 1]);
      const rowPx = Array.isArray(size) ? (size[1] ?? row) : row;
      const bandHeight = rowPx * BAND_FILL;
      const grid = params.coordSys as unknown as {
        x: number;
        width: number;
      };
      const x0 = Math.max(from[0] ?? 0, grid.x);
      const x1 = Math.min(to[0] ?? 0, grid.x + grid.width);
      if (x1 <= x0) return null;
      // At least one pixel, so a short state still shows up.
      const bandWidth = Math.max(1, x1 - x0);
      const y = (from[1] ?? 0) - bandHeight / 2;
      const fill = colors.get(band.state) ?? muiTheme.palette.grey[500];
      const children: Array<NonNullable<CustomSeriesRenderItemReturn>> = [
        {
          type: "rect",
          shape: { x: x0, y, width: bandWidth, height: bandHeight, r: 2 },
          style: { fill },
          emphasis: { style: { stroke: text.primary, lineWidth: 1 } },
        },
      ];
      if (showValues && bandWidth >= MIN_TEXT_WIDTH && bandHeight >= 12) {
        children.push({
          type: "text",
          silent: true,
          style: {
            x: x0 + bandWidth / 2,
            y: y + bandHeight / 2,
            text: band.state,
            fill: contrastText(fill),
            fontSize: LABEL_FONT_SIZE,
            align: "center",
            verticalAlign: "middle",
            width: bandWidth - 6,
            overflow: "truncate",
            ellipsis: "…",
          },
        });
      }
      return { type: "group", children } as CustomSeriesRenderItemReturn;
    };

    return {
      animation: false,
      grid: {
        left: labelWidth + 12,
        right: GRID_RIGHT,
        top: scrolls ? AXIS_HEIGHT : GRID_PAD,
        bottom: scrolls ? GRID_PAD : AXIS_HEIGHT,
      },
      xAxis: {
        type: "time",
        min: startMs,
        max: endMs,
        position: scrolls ? "top" : "bottom",
        axisLabel: {
          hideOverlap: true,
          color: text.secondary,
          formatter: (value: number) => formatTime(value, timeFormat),
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: "category",
        data: rows,
        inverse: true,
        axisTick: { show: false },
        axisLine: { show: false },
        splitLine: { show: false },
        axisLabel: {
          color: text.primary,
          fontSize: LABEL_FONT_SIZE,
          width: labelWidth,
          overflow: "truncate",
          ellipsis: "…",
        },
      },
      tooltip: {
        trigger: "item",
        confine: true,
        formatter: (params: { dataIndex: number }): string => {
          const band = bands[params.dataIndex];
          if (!band) return "";
          const color = colors.get(band.state) ?? "";
          const name = rows[band.row] ?? "";
          return [
            `<b>${escapeHtml(name)}</b>`,
            `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;background:${escapeHtml(color)}"></span>${escapeHtml(band.state)}`,
            `${escapeHtml(formatTime(band.start, fullFormat))} to ${escapeHtml(formatTime(band.end, fullFormat))}`,
            `Duration: ${escapeHtml(formatDuration(band.end - band.start))}`,
          ].join("<br/>");
        },
      },
      series: [
        {
          type: "custom",
          renderItem,
          encode: { x: [1, 2], y: 0 },
          data: bands.map((b) => [b.row, b.start, b.end]),
        },
      ],
    };
  }, [
    rows,
    bands,
    colors,
    startMs,
    endMs,
    row,
    scrolls,
    chartWidth,
    showValues,
    formatTime,
    muiTheme,
  ]);

  return (
    <Box
      sx={{
        width,
        height,
        overflowX: "hidden",
        overflowY: scrolls ? "auto" : "hidden",
      }}
    >
      <EChart
        sx={{ width: chartWidth, height: scrolls ? chartHeight : height }}
        option={option}
        theme={chartsTheme.echartsTheme}
      />
    </Box>
  );
}
