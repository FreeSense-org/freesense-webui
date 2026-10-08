# meter

A horizontal usage bar with warn/crit thresholds, a label and a value text:
CPU, memory, disks, the state table, mbuf.

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `label` | string | — | Visible label (also the accessible name) |
| `value` | number | — | Static value |
| `source` | `{path, query}` | — | API source |
| `field` | path | — | Value in `data` (see stat-tile for the path syntax) |
| `every` | seconds | `0` | Poll interval |
| `max` | number | `100` | Maximum (static) |
| `maxField` | path | — | Maximum from the API, e.g. `memory.total` |
| `min` | number | `0` | Minimum |
| `format` | see stat-tile | `pct` | How the value is written |
| `unit`, `decimals` | | — | As in stat-tile |
| `show` | `auto` \| `pct` \| `value` \| `both` | `auto` | Text on the right. `auto`: `pct` for `format: pct`, otherwise `42% · 3.4 GiB of 8 GiB` |
| `warn`, `crit` | percent | `75`, `90` | Thresholds in percent of max. `null` turns one off |
| `direction` | `above` \| `below` | `above` | `below`: low is bad (battery, free space) |
| `marks` | bool | `true` | Hairline marks at the thresholds |
| `color` | 1–8 \| status \| `accent` | series 1 | Normal fill colour |
| `size` | `sm` \| `md` \| `lg` | `md` | Bar thickness |

## Builder (PHP, P4)

```php
$ui->meter(gettext('State table'))
    ->source('/v1/status/states')->field('current')->maxField('max')
    ->format('num')->every(3);
```

## Instance API

- Static: `set(value, max?)`.
- Live: `reload()`.

## Events

None.

## Accessibility

- `role="meter"` with `aria-valuemin/max/now` (percent), `aria-valuetext` (the visible text plus the level) and `aria-label` from `label`.
- At warn/crit a status icon appears next to the value, with a visually hidden "Warning"/"Critical": colour is never the only signal.
- The fill animates with `transform` only; no animation under `prefers-reduced-motion`.
