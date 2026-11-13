import { PanelPlugin } from "@perses-dev/plugin-system";
import { StateTimelineChartComponent } from "./StateTimelineChartComponent";
import {
  StateTimelineChartOptions,
  StateTimelineChartProps,
  createInitialStateTimelineChartOptions,
} from "./state-timeline-chart-types";
import { StateTimelineChartSettingsEditor } from "./StateTimelineChartSettingsEditor";
import { StateTimelineValueMappingEditor } from "./StateTimelineValueMappingEditor";

/** Continuous state bands per row on the dashboard's time axis. */
export const StateTimelineChart: PanelPlugin<
  StateTimelineChartOptions,
  StateTimelineChartProps
> = {
  PanelComponent: StateTimelineChartComponent,
  panelOptionsEditorComponents: [
    { label: "Settings", content: StateTimelineChartSettingsEditor },
    { label: "Value mapping", content: StateTimelineValueMappingEditor },
  ],
  supportedQueryTypes: ["TimeSeriesQuery"],
  createInitialOptions: createInitialStateTimelineChartOptions,
};
