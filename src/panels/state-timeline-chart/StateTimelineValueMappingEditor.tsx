import { ReactElement } from "react";
import { ValueMapping, ValueMappingsEditor } from "@perses-dev/components";
import { StateTimelineChartEditorProps } from "./state-timeline-chart-types";

/**
 * Value mappings turn a value (value mode) or a label value (label mode) into the state's display
 * text and colour. In label mode, the order also sets the priority when several states hold at once.
 */
export function StateTimelineValueMappingEditor(
  props: StateTimelineChartEditorProps,
): ReactElement {
  const { onChange, value } = props;
  return (
    <ValueMappingsEditor
      mappings={value.mappings ?? []}
      onChange={(mappings: ValueMapping[]) =>
        onChange({ ...value, mappings: mappings.length ? mappings : undefined })
      }
    />
  );
}
