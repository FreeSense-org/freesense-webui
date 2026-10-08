# live-indicator

Shows whether the data on the page is live, paused, out of date or
disconnected, with a pause/resume button. Used in the status bar, page
headers and log views.

| State | Icon | Label | When |
|---|---|---|---|
| `live` | breathing dot | Live | Default |
| `paused` | pause | Paused | `FS.live.pause()` is on (from this button or anywhere else) |
| `stale` | clock-rotate-left | Out of date | An element in scope is marked stale by `FS.states` (`data-fs-stale` / `data-fs-state="stale"`), or the heartbeat is stale |
| `offline` | plug-circle-xmark | Connection lost | The heartbeat `source` fails |

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `source` | `{ path, query }` | — | Optional heartbeat polled through `ctx.live` (e.g. `/v1/status/system`) |
| `every` | seconds | `10` | Heartbeat interval |
| `scope` | CSS selector | `body` | Where to look for stale elements (e.g. `[data-fs-main]`) |
| `compact` | bool | `false` | Icon only; the label stays for screen readers and as tooltip |
| `control` | bool | `true` | Show the pause/resume button |
| `labels` | `{ live, paused, stale, offline }` | — | Override labels |

## Builder (PHP, P4)

```php
$ui->liveIndicator()->scope('[data-fs-main]');
$ui->liveIndicator()->source('/v1/status/system')->compact();
```

## Instance API

`FS.el.get(node).state` → current state.

## Events

Listens to `fs:live-paused` on the document. The button calls `FS.live.pause()` (toggle), which triggers that event for every indicator.

## Accessibility

- The state is icon + text in a `role="status"` element, so changes are announced politely (they are rare: pause, resume, stale, offline).
- The button has `aria-label` "Pause live updates" / "Resume live updates" and `aria-pressed`; it is 40 px on touch screens.
- The breathing ring is off under `prefers-reduced-motion`.
