# log-viewer

Live tail plus history of one log (firewall, system, and later DHCP, DNS,
VPN): newest entries on top, filters and a debounced search from the
`toolbar` element, pause/resume, an "N new entries" pill instead of rows that
jump while you read, infinite scroll into older pages, a bounded DOM, and a
detail drawer per row. The `LogPage` pattern is built on it.

## Cursor protocol

Every log endpoint answers the same way (see `gallery/mock/core.js`):

| Query | Returns |
|---|---|
| `?limit=n` (+ `q`, filters) | the newest `n` matching entries, newest first; `meta.has_more` |
| `?after=<id>` | entries newer than `id` (live tail), **oldest first** |
| `?before=<id>` | an older page below `id`, newest first; `meta.has_more` |
| any | `meta.last_id`: the cursor for the next `?after=` call |

Search (`q`) and filters are sent with every call. Changing them resets the
cursor and reloads from the newest entry.

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `source` | `{path, query}` | — | Log endpoint, e.g. `{path: '/v1/logs/firewall'}` |
| `type` | `firewall` \| `system` | from the path (`firewall` when it contains "firewall") | Column set, filters and drawer fields |
| `title` | string | `Firewall log` / `System log` | Accessible name (table caption, drawer subtitle) |
| `columns` | string[] | all of the type | Column ids in order. Firewall: `action`, `time`, `iface`, `dir`, `src`, `dst`, `proto`, `rule`. System: `time`, `severity`, `process`, `message` |
| `live` | bool | `true` | Live tail with the pause/resume button. `false`: history only |
| `every` | seconds | `2` | Live poll interval |
| `limit` | number | `100` | Page size for the first load and each older page |
| `maxRows` | number | `1000` | Rows kept in the DOM (see "Row cap") |
| `height` | CSS length \| `auto` | `36rem` | Height of the scroll area |
| `search` | bool \| `{placeholder, label, delay, value}` | `true` | Search box (debounced, 300 ms) |
| `filters` | `true` \| `false` \| toolbar Filter[] | `true` | `true`: the type's defaults (firewall: action chips, interface select from `/v1/status/interfaces`; system: severity chips, process select learned from the first page). An array is passed to the toolbar as is; its ids become query keys |
| `filterValues` | object | `{}` | Initial filter values, e.g. `{action: ['block']}` |
| `interfaces` | `[{value, label}]` | fetched | Interface options (skips the fetch) |
| `processes` | `string[]` \| `[{value, label}]` | learned | Process options |
| `summary` | bool | `false` | Summary strip: blocked / passed in view (errors / warnings for system logs) as `stat-tile`s, plus the top three blocked sources (busiest processes); click one to search (filter) for it |
| `ruleHref` | URL template | `/security/rules?rule={rule_id}` | "Open rule" link in the firewall drawer; `{field}` placeholders come from the entry. `null` hides it |
| `quickRules` | `{block, pass}` each `{method, path, body}` | — | Requests for the drawer's "Block source" and "Pass this traffic" (`{src}`, `{iface}`, … placeholders in path and body). Without them the buttons only report a drafted rule (toast) and emit `fs:log-quick-rule` |

## Behaviour

- **Live tail:** polls `?after=` through `ctx.live`. While the scroll area is at the top, new entries are inserted at the top with a short highlight (a static marker under `prefers-reduced-motion`).
- **No jumping:** while the user is scrolled away from the top, or the view is paused, new entries wait. A pill "N new entries" appears over the table; clicking it (or scrolling back to the top) inserts them.
- **Pause:** the Live button, or **Space** while the scroll area or a row has focus. Pausing stops polling; resuming fetches what was missed.
- **Older entries:** an IntersectionObserver near the bottom, or the "Load older" button, loads `?before=` pages until "Beginning of the log".
- **Row cap:** at most `maxRows` rows. New rows push the oldest out (they can be loaded again). Loading older pages past the cap drops the newest rows instead and turns the pill into "Jump to latest", which reloads from the top.
- **Details:** a click (not a text selection) or **Enter** on a row opens `FS.drawer` with every field (`kv-list`, copy buttons on addresses). Firewall: "Block source", "Pass this traffic", "Open rule". System: "Only <process>" (sets the process filter).
- **Phones and narrow columns** (container < 40 rem): rows are stacked cards (action, time, interface; source → destination; protocol and rule), toolbar on its own rows.
- **States:** skeleton on the first load, empty state (different text when filters are active), error with retry, stale (dimmed) when a refresh fails, "Reconnecting" on the live button.

## Builder (PHP, P4)

```php
$ui->logViewer('/v1/logs/firewall')
   ->columns(['action', 'time', 'iface', 'src', 'dst', 'proto', 'rule'])
   ->summary()->every(2)->maxRows(1000)
   ->ruleHref('/security/rules?rule={rule_id}');

$ui->logViewer('/v1/logs/system')->filterValues(['severity' => ['error', 'warning']]);
```

## Instance API

| Method | Effect |
|---|---|
| `reload()` | Reload from the newest entry (keeps search and filters) |
| `pause(bool = true)` | Pause (`true`) or resume (`false`) the live tail |
| `isLive()` | Whether the tail is running |
| `search(text)` | Set the search text and reload |
| `filter(id, value)` | Set one filter and reload |
| `rows()` | Entries currently in the DOM, newest first |

## Events

| Event | Detail |
|---|---|
| `fs:log-live` | `{live}` after pause/resume |
| `fs:log-quick-rule` | `{kind: 'block' \| 'pass', entry}` when a quick rule is drafted without `quickRules` |

The nested toolbar's `fs:search` / `fs:filter` are handled and stopped here.

## Accessibility

- A real `<table>` with a caption and column headers; on narrow screens the headers are visually hidden, not removed.
- Rows are focusable: **Enter** opens details, **↑/↓/Home/End** move between rows, **Space** pauses or resumes. The scroll area has a label that names these keys.
- Actions and severities are `status` pills (icon + text), never colour only.
- The live button's text changes ("Live", "Paused", "Reconnecting") and its accessible name says what a click does; pause/resume is announced in a polite live region. New rows are not announced.
- The pill, "Load older" and the live button are 40 px high on touch screens; the highlight respects `prefers-reduced-motion`.
