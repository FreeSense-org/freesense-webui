# chart

A time-series chart built on uPlot. It seeds from a history source (RRD) for the
selected range, then appends live samples from another source on short ranges
(`10m` by default). Longer ranges show history only. Range picker, legend with
current values, hover crosshair with a readout, unit-aware y-axis, stacked and
area modes, theme-aware colours and container resizing.

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `title` | string | — | Heading above the plot (also part of the accessible name) |
| `unit` | `bps` \| `bytes` \| `pct` \| `ms` \| `pps` \| `num` | `num` | Axis, legend and readout formatting |
| `series` | `[{field, live, label, color, fill, hidden}]` | — | `field`: array in the history response; `live`: path of the value in the live response (defaults to `field`); `color`: 1–8 (`--fs-series-N`), a status or `accent`; `fill`: area under this series; `hidden`: start hidden |
| `history` | `{path, query, every}` | — | History source; `range` is added to the query. Response `{t: [unix s…], <field>: […]}` |
| `live` | `{path, query, every}` | — | Live source, polled every `every` s (default 5). The sample time is `meta.t`, else now |
| `range` | `10m` \| `1h` \| `24h` \| `7d` \| `30d` | `1h` | Initial range |
| `ranges` | string[] | `[]` | Show a range picker with these ranges (two or more) |
| `liveRanges` | string[] | `['10m']` | Ranges that append live samples (window = the range) |
| `stacked` | bool | `false` | Stack the series (bands between them) |
| `area` | bool | `false` | Fill every series |
| `min`, `max` | number | `0`, auto | Fixed y range (e.g. 0–100 for `pct`) |
| `height` | px | `220` | Plot height |
| `legend` | bool | `true` | Legend with the latest values |
| `decimals` | number | — | Decimals in the readout |
| `data` | `{t, <field>…}` | — | Static data instead of sources |

Without `history`, a chart with `live` accumulates samples into the `range` window.

## Builder (PHP, P4)

```php
$ui->chart(gettext('WAN traffic'))->unit('bps')
    ->history('/v1/status/traffic/history', ['if' => 'wan'])
    ->live('/v1/status/traffic', ['if' => 'wan'], every: 2)
    ->series('in_bps', gettext('In'), live: 'wan.in_bps', color: 1, fill: true)
    ->series('out_bps', gettext('Out'), live: 'wan.out_bps', color: 2)
    ->range('10m')->ranges(['10m', '1h', '24h', '7d']);
```

## Instance API

- `setRange(r)`, `range` (current range), `reload()`.
- `plot()` returns the uPlot instance (for tests).

## Events

- `fs:chart-range` on the node, with the new range, when the user picks one.

## Behaviour

- Colours, grid and text are read from the tokens (`--fs-series-*`, `--fs-chart-grid`, `--fs-chart-text`, `--fs-font-ui`) and re-read on `fs:theme` (mode, accent, density, theme).
- A `ResizeObserver` keeps the plot as wide as its container.
- The live task marks the chart stale when the live source fails; history errors use `FS.states`.
- Nothing animates, so `prefers-reduced-motion` needs no special case.

## Accessibility

- The plot is `role="img"` with a label: title, range and the latest value of each series. It is not a live region.
- The range picker is a group of buttons with `aria-pressed`; each has a full name ("Last hour").
- Legend entries are buttons (`aria-pressed`) that show or hide a series; the last visible series cannot be hidden. Hidden series are marked by an outline swatch and strike-through, not colour alone.
- The hover readout is for pointer users (`aria-hidden`); the legend carries the same values. A table view is a known gap.
- Touch targets in the picker and legend grow to 40 px on phones.
