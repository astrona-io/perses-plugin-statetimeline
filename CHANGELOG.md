# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-13

### Added

- `StateTimelineChart` panel ("State timeline"): continuous state bands per row on a real time axis
  that follows the dashboard time range. Consecutive samples with the same state merge into one band
  from its first sample to the start of the next state; a gap longer than `mergeGapFactor` query
  steps (default 2) ends the band and leaves the time empty.
- Two state modes: `value` (each series is a row, the sample value is the state through Perses value
  mappings, unmapped values shown formatted) and `label` (series grouped into rows by `rowLabels`,
  the state is the `stateLabel` value of the series whose sample is non-zero; with several, the
  first matching value mapping wins, else they are joined with ` + `).
- Colours: explicit mapping colours, else defaults for common state strings (green, amber, red from
  the theme), else a stable colour per state from the Perses charts palette.
- Row sorting by name, worst latest state first, or most state changes first; fixed or automatic
  row height with scrolling inside the panel; state text inside wide enough bands; a legend of the
  states; a tooltip with row, state, start, end and duration. Light and dark themes.
- Panel settings and value mapping editors, and a CUE schema.
- `Containerfile` for a plugin-only OCI image, for use as a Kubernetes image volume, and a release
  workflow that publishes the archive and the image to GitHub.

Tested to build with Perses v0.54.0 packages and `percli` v0.54.0.

[Unreleased]: https://github.com/astrona-io/perses-plugin-statetimeline/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/astrona-io/perses-plugin-statetimeline/releases/tag/v0.1.0
