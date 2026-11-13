import { ReactElement } from "react";
import { Autocomplete, Chip, MenuItem, Switch, TextField } from "@mui/material";
import {
  OptionsEditorColumn,
  OptionsEditorControl,
  OptionsEditorGrid,
  OptionsEditorGroup,
} from "@perses-dev/components";
import { LegendOptionsEditor } from "@perses-dev/plugin-system";
import {
  DEFAULT_MERGE_GAP_FACTOR,
  DEFAULT_MODE,
  RowSorting,
  SORTING_LABELS,
  StateMode,
  StateTimelineChartEditorProps,
  StateTimelineChartOptions,
} from "./state-timeline-chart-types";

function parsePositive(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function StateTimelineChartSettingsEditor(
  props: StateTimelineChartEditorProps,
): ReactElement {
  const { onChange, value } = props;
  const set = (patch: Partial<StateTimelineChartOptions>): void =>
    onChange({ ...value, ...patch });
  const mode = value.mode ?? DEFAULT_MODE;

  return (
    <OptionsEditorGrid>
      <OptionsEditorColumn>
        <OptionsEditorGroup title="States">
          <OptionsEditorControl
            label="State from"
            description="Value: each series is a row, its value is the state. Label: series are grouped into rows, the state is a label of the series that is non-zero"
            control={
              <TextField
                select
                size="small"
                value={mode}
                onChange={(e) => set({ mode: e.target.value as StateMode })}
              >
                <MenuItem value="value">Series value</MenuItem>
                <MenuItem value="label">Series label</MenuItem>
              </TextField>
            }
          />
          {mode === "label" ? (
            <>
              <OptionsEditorControl
                label="State label"
                description="Label whose value is the state, for example phase, reason or ready"
                control={
                  <TextField
                    size="small"
                    placeholder="phase"
                    value={value.stateLabel ?? ""}
                    onChange={(e) =>
                      set({ stateLabel: e.target.value || undefined })
                    }
                  />
                }
              />
              <OptionsEditorControl
                label="Row labels"
                description="Labels that identify a row, for example namespace and deployment. Empty: every label except the state label"
                control={
                  <Autocomplete
                    multiple
                    freeSolo
                    size="small"
                    options={[]}
                    value={value.rowLabels ?? []}
                    onChange={(_, rowLabels) =>
                      set({
                        rowLabels: rowLabels.length
                          ? rowLabels.map((l) => l.trim()).filter(Boolean)
                          : undefined,
                      })
                    }
                    renderTags={(labels, getTagProps) =>
                      labels.map((label, index) => {
                        const { key, ...tagProps } = getTagProps({ index });
                        return (
                          <Chip
                            key={key}
                            size="small"
                            label={label}
                            {...tagProps}
                          />
                        );
                      })
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        placeholder="Type a label, press Enter"
                      />
                    )}
                  />
                }
              />
            </>
          ) : null}
          <OptionsEditorControl
            label="Gap factor"
            description="A gap longer than this many query steps ends a state and shows no data"
            control={
              <TextField
                size="small"
                type="number"
                placeholder={String(DEFAULT_MERGE_GAP_FACTOR)}
                inputProps={{ min: 1, step: 0.5 }}
                value={value.mergeGapFactor ?? ""}
                onChange={(e) =>
                  set({ mergeGapFactor: parsePositive(e.target.value) })
                }
              />
            }
          />
        </OptionsEditorGroup>
        <OptionsEditorGroup title="Rows">
          <OptionsEditorControl
            label="Sort rows"
            description="Worst state first: rows whose latest state is an error, then a warning, then the rest"
            control={
              <TextField
                select
                size="small"
                value={value.sorting ?? "none"}
                onChange={(e) =>
                  set({
                    sorting:
                      e.target.value === "none"
                        ? undefined
                        : (e.target.value as RowSorting),
                  })
                }
              >
                {Object.entries(SORTING_LABELS).map(([id, label]) => (
                  <MenuItem key={id} value={id}>
                    {label}
                  </MenuItem>
                ))}
              </TextField>
            }
          />
          <OptionsEditorControl
            label="Row height"
            description="Pixels per row. Empty: rows share the panel height; the panel scrolls when they do not fit"
            control={
              <TextField
                size="small"
                type="number"
                placeholder="Auto"
                inputProps={{ min: 8, step: 1 }}
                value={value.rowHeight ?? ""}
                onChange={(e) =>
                  set({ rowHeight: parsePositive(e.target.value) })
                }
              />
            }
          />
          <OptionsEditorControl
            label="Show values"
            description="Write the state inside a band when it is wide enough"
            control={
              <Switch
                checked={value.showValues ?? true}
                onChange={(_, showValues) => set({ showValues })}
              />
            }
          />
        </OptionsEditorGroup>
      </OptionsEditorColumn>
      <OptionsEditorColumn>
        <LegendOptionsEditor
          showValuesEditor={false}
          value={value.legend}
          onChange={(legend) => set({ legend })}
        />
      </OptionsEditorColumn>
    </OptionsEditorGrid>
  );
}
