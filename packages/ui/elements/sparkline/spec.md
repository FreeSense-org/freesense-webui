# sparkline

A tiny inline SVG trend (line or area), from a static array or by
accumulating a polled value. Optional label and latest value beside it (gateway
RTT lists).

`viz.js` in this folder holds the helpers every data-visualisation element
shares (field paths, unit formatting, thresholds, token colours, SVG nodes).
`sparkSvg(values, opts, $wrap)` draws the plot for other elements (stat-tile).

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `values` | (number\|null)[] | — | Static values; `null` leaves a gap |
| `source`, `field`, `every` | | — | Poll a value and append it (as in stat-tile) |
| `points` | number | `30` | Values kept |
| `variant` | `line` \| `area` | `line` | Area fills down to 0 |
| `color` | 1–8 \| status \| `accent` \| `--fs-*` token | series 1 | Line colour |
| `min`, `max` | number | auto | Fixed y range |
| `label` | string | `Trend` | Accessible name (and visible with `showLabel`) |
| `showLabel` | bool | `false` | Show the label before the line |
| `showValue` | bool | `false` | Show the latest value after the line |
| `format`, `unit`, `decimals` | | `num` | Formatting of the value and the description |
| `size` | `block` \| `inline` \| `lg` | `block` | `inline` sits in text (6 rem × 1.25 rem); `lg` is 3.5 rem high |

## Builder (PHP, P4)

```php
$ui->sparkline('WAN_DHCP')->showLabel()->showValue()
    ->source('/v1/status/gateways')->field('[name=WAN_DHCP].rtt')
    ->format('ms')->every(2);
```

## Instance API

- `push(value)` appends a value; `set(values)` (static) replaces them.
- Live: `values()` returns a copy, `reload()` polls now.

## Events

None.

## Accessibility

- The row is `role="img"` with a label like "WAN_DHCP: latest 8.4 ms, 6.1 ms–12 ms". The SVG is `aria-hidden`.
- The visible value is real text. No live region (values change every few seconds).
- No animation.
