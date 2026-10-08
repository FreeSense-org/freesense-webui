# stat-tile

A headline number: a label, a big value with a smaller muted unit, and
optionally a trend against the previous value, a sparkline of recent values,
a status and a link. Static (`value`) or live (`source` + `field` + `every`).

The tile is a card itself (show it on the page background, or set `plain`
inside another card). It follows `[data-fs-skin-cards]` (`outlined`, `raised`, `flat`).

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `label` | string | — | Label above the value |
| `icon` | string | — | Font Awesome Solid name before the label |
| `value` | number | — | Static value (when there is no `source`) |
| `source` | `{path, query}` | — | API source, e.g. `{path: '/v1/status/traffic', query: {if: 'wan'}}` |
| `field` | path | — | Value in `data`: `wan.in_bps`, `cpu.usage`, `[name=WAN_DHCP].rtt`, `disks.0.used` |
| `every` | seconds | `0` | Poll interval (0 = load once) |
| `format` | `bps` \| `bytes` \| `num` \| `compact` \| `pct` \| `duration` \| `ms` \| `pps` \| `raw` | `num` | Value formatting; the unit is split off and shown muted |
| `unit` | string | — | Unit for `num`, `compact` and `raw` (e.g. `MiB`) |
| `decimals` | number | — | Fixed decimals |
| `size` | `regular` \| `compact` | `regular` | Compact for dense rows |
| `plain` | bool | `false` | No card surface (inside another card or widget) |
| `trend` | bool | `false` | Show the change against the previous value (previous poll, or `previous`) |
| `previous` | number | — | Previous value for a static tile |
| `trendAs` | `pct` \| `abs` | `pct` | Relative change or absolute delta in the value's format |
| `good` | `up` \| `down` | — | Which direction is good: colours the trend ok/crit. Without it the trend is neutral |
| `spark` | bool \| `{points, variant, color}` | — | Sparkline of recent values (`points` 30, `variant` `area`/`line`, `color` 1–8 or a status) |
| `history` | number[] | — | Seed values for the sparkline (static tiles draw it as given) |
| `status` | state | — | Static status (status element states) |
| `warn`, `crit` | number | — | Thresholds on the value → status ok/warn/crit |
| `direction` | `above` \| `below` | `above` | `below`: low values are bad |
| `statusField` | path | — | Status word from the API (`online`, `down`, …) → status state |
| `statusMap` | object | — | Extra word → state mapping |
| `statusLabels` | `{ok, warn, crit, …}` | per state | Visible status text |
| `detail` | string | — | Muted line under the value |
| `detailField` | path | — | Detail from the API; a number shows as `of <formatted>` |
| `detailPrefix`, `detailFormat` | string | `of`, `format` | How a numeric detail is shown |
| `href` | URL | — | Makes the whole tile a link (partial navigation) |

## Builder (PHP, P4)

```php
$ui->statTile(gettext('WAN download'))
    ->icon('arrow-down')
    ->source('/v1/status/traffic', ['if' => 'wan'])->field('wan.in_bps')->every(2)
    ->format('bps')->trend(good: 'up')->spark(points: 40)
    ->href('/interfaces/wan');
```

## Instance API

- Static: `FS.el.get(node).set(value)` — the old value becomes the trend base.
- Live: `reload()` polls now; `value()` returns the current value.

## Events

None.

## Accessibility

- The value is real text; the unit is a separate muted span.
- The trend arrow is `aria-hidden`; a visually hidden sentence says "up 12% from the previous value". Colour is never the only signal (arrow + text).
- The status uses the status element (icon + text).
- With `href`, the label is the link and stretches over the tile; focus outlines the whole tile.
- Live values are not announced on every tick (no live region).
- Loading, empty, error and stale come from `FS.states`.
