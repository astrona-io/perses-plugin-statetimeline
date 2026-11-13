package model

import (
	"github.com/perses/shared/cue/common"
)

kind: "StateTimelineChart"
spec: close({
	// Where a row's state comes from. value (default): each series is a row and its sample value,
	// through the mappings, is the state. label: series are grouped into rows by rowLabels and the
	// state is the stateLabel value of the row's series whose sample is non-zero.
	mode?: "value" | "label"
	// Label mode: labels that identify a row. Empty: every label except stateLabel and __name__.
	rowLabels?: [...(string & =~"^[a-zA-Z_][a-zA-Z0-9_]*$")]
	// Label mode: label whose value is the state.
	stateLabel?: string & =~"^[a-zA-Z_][a-zA-Z0-9_]*$"
	// Display text and colour per value (value mode) or label value (label mode). In label mode the
	// order is also the priority when several states hold at the same time.
	mappings?: [...common.#mappings]
	legend?: common.#legend
	// Row order; unset keeps the query order.
	sorting?: "asc" | "desc" | "worst" | "changes"
	// Pixels per row; unset: rows share the panel height (at least 20 px, then the panel scrolls).
	rowHeight?: number & >0
	// Write the state inside a band when it is wide enough. Default true.
	showValues?: bool
	// A gap longer than this many query steps ends a band. Default 2.
	mergeGapFactor?: number & >0
})
