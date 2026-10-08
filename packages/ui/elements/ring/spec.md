# ring

A circular gauge (SVG) with warn/crit thresholds, the value in the centre and
a label below. For dashboard summaries (CPU, memory, states, temperature).

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `label` | string | — | Caption below the ring (also the accessible name) |
| `value` | number | — | Static value |
| `source`, `field`, `every` | | — | As in stat-tile |
| `max` / `maxField` | number / path | `100` | Maximum |
| `min` | number | `0` | Minimum |
| `format`, `unit`, `decimals` | | `pct` | As in stat-tile |
| `display` | `auto` \| `pct` \| `value` | `auto` | Centre text. `auto`: percent when there is a max, else the value |
| `detail` | string | `<value> of <max>` when the format is not `pct` | Muted second caption line |
| `detailField` | path | — | Detail text from the API (e.g. `cpu.model`) |
| `warn`, `crit` | percent | `75`, `90` | Thresholds in percent of the range |
| `direction` | `above` \| `below` | `above` | `below`: low is bad |
| `color` | 1–8 \| status \| `accent` | series 1 | Normal arc colour |
| `size` | `sm` \| `md` \| `lg` | `md` | Diameter 4.75 / 7.5 / 10 rem |

## Builder (PHP, P4)

```php
$ui->ring(gettext('CPU'))
    ->source('/v1/status/system')->field('cpu.usage')->every(2)
    ->thresholds(warn: 60, crit: 85);
```

## Instance API

- Static: `set(value, max?)`.
- Live: `reload()`.

## Events

None.

## Accessibility

- `role="meter"` with `aria-valuenow` (percent) and an `aria-valuetext` that includes the detail and the level.
- The SVG and the centre text are `aria-hidden` (the meter carries the value).
- At warn/crit the centre shows an icon plus "Warning"/"Critical" (the text is hidden at `sm`; the meter's value text still says it).
- The arc transition stops under `prefers-reduced-motion`.
