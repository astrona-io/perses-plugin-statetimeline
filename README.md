# perses-plugin-statetimeline

A [Perses](https://perses.dev) panel plugin, `StateTimelineChart` ("State timeline"), that shows how
the state of things changes over time. Each row is one thing (a deployment, a Flux Kustomization, a
pod, a target) and each state is a coloured band on the dashboard's time axis, from the moment the
state began to the moment the next one started.

```text
apps / podinfo     |████ Ready ████████|▒ Reconciling ▒|████ Ready █████████████████|
apps / backend     |████ Ready ███|░░░░░░░░ Failed ░░░░░░░░░░░░|███ Ready ███████████|
infra / ingress    |████████████████████ Ready █████████████████████████████████████|
                   09:00          10:00          11:00          12:00          13:00
```

## Supported versions

| Plugin | Perses | Status |
| --- | --- | --- |
| 0.1.x | v0.54.x | Built against v0.54.0 |

The plugin is built against `@perses-dev/*` 0.54 and `percli` v0.54.0. Other Perses minor versions may
work but are not tested.

## How it differs from StatusHistoryChart

Perses ships a `StatusHistoryChart` panel. It draws an ECharts heatmap on a category x-axis: one cell
per query step, each cell coloured by its value. That fits "what was the value at each step", but not
"when did this change and how long did it last":

| | StatusHistoryChart | StateTimelineChart |
| --- | --- | --- |
| x-axis | category axis, one cell per step | real time axis aligned with the dashboard time range |
| Shape | one cell per sample | one band per state, merged across samples |
| Gaps | an empty cell | a band ends after `mergeGapFactor` missing steps; the time stays empty |
| Where the state comes from | the sample value | the sample value, or a label of the series that is non-zero (`label` mode) |
| Tooltip | value at a step | row, state, start, end and duration |
| Options | `legend`, `mappings`, `sorting` | those, plus `mode`, `rowLabels`, `stateLabel`, `rowHeight`, `showValues`, `mergeGapFactor`, and more sort orders |

`label` mode is what makes Kubernetes metrics usable as-is: kube-state-metrics and flux-operator
expose a state as a label on a series whose value is 1 when it holds, not as a number.

## What it does

- **Bands.** Consecutive samples of a row with the same state become one band, from the first sample
  to the first sample of the next state. The last band of a row covers one step after its last
  sample, but never past the end of the time range.
- **Gaps.** When two samples are more than `mergeGapFactor` query steps apart (default 2), the band
  ends one step after the last sample and the time between is left empty. In `label` mode a
  timestamp at which every series of the row is 0 also ends the band. The step is the query's step,
  or the smallest distance between two samples when the data source does not report one.
- **States.**
  - `value` mode (the default): every series is a row, named by its formatted name (the query's
    legend format). Each sample value goes through the value mappings; a value no mapping matches is
    shown formatted (`1`, `0.5`, `1.2K`).
  - `label` mode: series are grouped into rows by the labels in `rowLabels`, and the row is named by
    their values joined with ` / `. Without `rowLabels`, a row is every label except `stateLabel` and
    `__name__`. At each timestamp the state is the value of `stateLabel` on the row's series whose
    sample is not 0. When several are not 0, the state whose value mapping comes first in the list
    wins; when none of them is mapped, they are shown together as `A + B`.
- **Colours**, in this order:
  1. the colour of the value mapping that matches the state;
  2. for common state strings (case-insensitive), the theme's success, warning and error colours:

     | Colour | States |
     | --- | --- |
     | green | `True`, `Ready`, `Running`, `Available`, `Succeeded`, `Healthy`, `Up`, `OK`, `Active`, `Complete`, `Completed`, `ReconciliationSucceeded` |
     | amber | `Unknown`, `Reconciling`, `Progressing`, `Pending`, `Warning`, `Waiting`, `Terminating`, `ContainerCreating`, `ProgressingWithRetry` |
     | red | `False`, `Failed`, `Failure`, `Error`, `CrashLoopBackOff`, `ImagePullBackOff`, `ErrImagePull`, `OOMKilled`, `Degraded`, `Unhealthy`, `Down`, `Critical`, `ReconciliationFailed`, `HealthCheckFailed`, `BuildFailed`, `ArtifactFailed`, `DependencyNotReady` |

     The match is on the displayed state, so a mapping that renames `1` to `Ready` without a colour
     gets green. A combined state (`A + B`) takes the colour of its worst part.
  3. any other state gets a colour from the Perses charts palette, picked from a hash of its text, so
     it keeps the same colour across refreshes and panels.
- **Rows.** Rows share the panel height, between 20 and 48 px each, unless `rowHeight` fixes it.
  When they do not fit, the panel scrolls and the time axis moves to the top.
- **Sorting.** Unset keeps the query order. `asc` and `desc` sort by row name (numbers in names sort
  naturally). `worst` puts rows whose latest state is an error first, then warning, then any other
  state, then healthy; ties go to the row with more state changes, then by name. A state counts as
  error, warning or healthy by the hue of its mapping colour (red, amber, green) when it has one,
  else by the table above. `changes` puts the rows with the most state changes first.
- **Text and tooltip.** With `showValues` (default on) the state is written inside each band that
  is wide enough, in black or white for contrast. The tooltip shows the row, the state, the start and
  end in the dashboard's time zone, and the duration.
- **Legend.** Optional (`legend`), lists every state shown with its colour.
- **No data.** When the queries return nothing drawable, the panel shows Perses' usual "No data".
  In `label` mode without a `stateLabel` it asks for one instead. The plugin never invents samples.

Filtering (which deployments, which namespace, suspended or not) is done in the query, not in the
plugin.

## Examples

### Deployment availability (kube-state-metrics)

`kube_deployment_status_condition` has one series per deployment, condition and status, with value 1
for the status that holds.

```promql
kube_deployment_status_condition{namespace="$namespace", condition="Available"}
```

```yaml
mode: label
rowLabels: [namespace, deployment]
stateLabel: status     # true | false | unknown: green, red, amber by default
sorting: worst
```

To show every condition that holds, with a priority, take the `true` series and let the state be the
condition. The first matching mapping wins when several conditions are true at once:

```promql
kube_deployment_status_condition{namespace="$namespace", status="true"}
```

```yaml
mode: label
rowLabels: [namespace, deployment]
stateLabel: condition
mappings:
  - kind: Value
    spec: { value: ReplicaFailure, result: { value: Replica failure, color: "#e53935" } }
  - kind: Value
    spec: { value: Available, result: { value: Available, color: "#43a047" } }
  - kind: Value
    spec: { value: Progressing, result: { value: Progressing, color: "#fb8c00" } }
```

### Flux Kustomizations (flux-operator)

flux-operator's `flux_resource_info` has one series per resource with value 1, and its `ready` and
`reason` labels change as the resource reconciles. Each change starts a new series, which is exactly
what `label` mode reads.

```promql
flux_resource_info{kind="Kustomization", suspended="false"}
```

```yaml
mode: label
rowLabels: [exported_namespace, name]
stateLabel: ready
mappings:
  - kind: Value
    spec: { value: "False", result: { value: Failed, color: "#e53935" } }
  - kind: Value
    spec: { value: Unknown, result: { value: Reconciling, color: "#fb8c00" } }
  - kind: Value
    spec: { value: "True", result: { value: Ready, color: "#43a047" } }
sorting: worst
```

Use `stateLabel: reason` instead to see why (`ReconciliationSucceeded`, `ReconciliationFailed`,
`HealthCheckFailed`, `DependencyNotReady`, ...).

### Pod phase (kube-state-metrics)

```promql
kube_pod_status_phase{namespace="$namespace"}
```

```yaml
mode: label
rowLabels: [namespace, pod]
stateLabel: phase      # Pending, Running, Succeeded, Failed, Unknown
```

### A numeric status metric

`value` mode with mappings, for example scrape targets:

```promql
up{job="$job"}
```

```yaml
mode: value
mappings:
  - kind: Value
    spec: { value: "1", result: { value: Up, color: "#43a047" } }
  - kind: Value
    spec: { value: "0", result: { value: Down, color: "#e53935" } }
```

`Range` and `Regex` mappings work as in other Perses panels, for example HTTP status classes:

```promql
max by (target) (probe_http_status_code)
```

```yaml
mode: value
mappings:
  - kind: Range
    spec: { from: 200, to: 299, result: { value: 2xx, color: "#43a047" } }
  - kind: Range
    spec: { from: 400, to: 599, result: { value: Error, color: "#e53935" } }
```

## Spec

```yaml
plugin:
  kind: StateTimelineChart
  spec:
    mode: value              # value | label
    rowLabels: []            # label mode: labels that identify a row
    stateLabel: ""           # label mode: label whose value is the state (required in label mode)
    mappings: []             # Perses value mappings (Value, Range, Regex, Misc)
    legend:                  # optional; hidden when unset
      position: bottom       # bottom | right
      mode: list             # list | table
      size: medium           # small | medium
    sorting: worst           # asc | desc | worst | changes; unset keeps the query order
    rowHeight: 24            # px per row; unset shares the panel height
    showValues: true         # state text inside wide enough bands
    mergeGapFactor: 2        # gap, in query steps, that ends a band
```

Every field is optional. A new panel starts with `mode: value`, `showValues: true` and a legend at
the bottom.

The CUE schema is in `schemas/panels/state-timeline-chart/`. A complete panel in a dashboard:

```yaml
panels:
  fluxKustomizations:
    kind: Panel
    spec:
      display: { name: Flux Kustomizations }
      plugin:
        kind: StateTimelineChart
        spec:
          mode: label
          rowLabels: [exported_namespace, name]
          stateLabel: ready
          sorting: worst
          legend: { position: bottom }
      queries:
        - kind: TimeSeriesQuery
          spec:
            plugin:
              kind: PrometheusTimeSeriesQuery
              spec:
                query: flux_resource_info{kind="Kustomization", suspended="false"}
```

## Build

You need Node 22 or later, [`percli`](https://github.com/perses/perses/releases/tag/v0.54.0) v0.54.0
and [`cue`](https://cuelang.org) on `PATH` (v0.17.1 tested). `percli` uses `cue` to vendor the Perses
CUE dependencies into the archive.

```bash
npm ci
npm run lint && npm run type-check
npm run build                 # module-federation bundle in dist/
percli plugin build           # validates the schema, writes StateTimeline-0.1.0.tar.gz
```

`npm run dev` serves the plugin for `percli plugin start` against a running Perses. See
[CONTRIBUTING.md](CONTRIBUTING.md) for more.

The chart is drawn with Perses' own `EChart` component and an ECharts `custom` series (one rectangle
per band on a `time` axis), so the plugin adds no runtime dependency.

## Install into Perses

Perses extracts every `*.tar.gz` in `plugin.archive_paths` into `plugin.path` at startup. Setting
`archive_paths` replaces the default, so keep the directory of bundled plugins in the list. Pick one
of the three options below and restart Perses.

### Option A: release archive

Download `StateTimeline-<version>.tar.gz` from the
[GitHub releases](https://github.com/astrona-io/perses-plugin-statetimeline/releases), put it in a
directory Perses can read, and add that directory to the config:

```bash
curl -fLO https://github.com/astrona-io/perses-plugin-statetimeline/releases/download/v0.1.0/StateTimeline-0.1.0.tar.gz
```

```yaml
plugin:
  archive_paths:
    - /etc/perses/plugins-archive        # plugins bundled with Perses
    - /etc/perses/plugins-archive-extra  # put StateTimeline-0.1.0.tar.gz here
```

### Option B: Kubernetes image volume

The `Containerfile` packages the archive as a plugin-only OCI image (`FROM scratch`, the archive at the
image root). Every release publishes it as `ghcr.io/astrona-io/perses-plugin-statetimeline:v<version>`
for linux/amd64 and linux/arm64, so you can use that image directly. To build and push it to your own
registry instead:

```bash
percli plugin build
podman build -t ghcr.io/<owner>/perses-plugin-statetimeline:<version> .
podman push ghcr.io/<owner>/perses-plugin-statetimeline:<version>
```

Then mount it into the Perses pod as an
[image volume](https://kubernetes.io/docs/concepts/storage/volumes/#image) and add the mount path to
`archive_paths` as in option A. Image volumes need a cluster and container runtime that support them
(the `ImageVolume` feature; check your Kubernetes version and feature gates).

```yaml
volumes:
  - name: statetimeline-plugin
    image:
      reference: ghcr.io/<owner>/perses-plugin-statetimeline:<version>
      pullPolicy: IfNotPresent
containers:
  - name: perses
    volumeMounts:
      - name: statetimeline-plugin
        mountPath: /etc/perses/plugins-archive-extra
        readOnly: true
```

If the registry is private, add an `imagePullSecrets` entry to the pod as for any other image. To
install several plugin images, mount each one in its own directory and list every directory in
`archive_paths`.

### Option C: custom Perses image

Copy the archive into the directory of bundled plugins. No config change is needed, because that
directory is in the default `archive_paths`:

```dockerfile
FROM persesdev/perses:v0.54.0
COPY StateTimeline-0.1.0.tar.gz /etc/perses/plugins-archive/
```

## Licences

The plugin is Apache-2.0 (`LICENSE`). Third-party material and its notices are listed in `NOTICE`:
only the Perses shared CUE schemas, vendored into the archive at build time (Apache-2.0).
