# data-table

The API-backed list behind every `ResourcePage` and most status pages:
firewall rules, NAT, aliases, DHCP leases, states, ARP/NDP, users, certificates.
It loads rows from the API, refreshes them live, and offers search, filters,
sorting, paging, selection with bulk actions, row actions, an inline enable
switch, drag and keyboard reorder, groups and locked rows.

Rows are rendered once and kept in a map keyed by the row id. A refresh
patches only the `live` cells of unchanged rows, rebuilds rows whose other
fields changed, and moves rows with the fewest DOM operations, so 500–1000
rows refresh without a full re-render.

Layout follows the **container** width (a table in a narrow card behaves like
one on a phone):

| Width | Layout |
|---|---|
| ≥ 64rem | Full table |
| 48–64rem | Columns with `priority: 3` hidden; the table scrolls inside its container; the lead (handle/checkbox), the switch and the first visible column stay sticky |
| < 48rem | Each row is a card: the primary column as title, the switch and the actions menu on the first line, then `label: value` pairs. Inline action buttons move into the menu. A card bar offers "Select all" and a sort select |

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `source` | `{path, query}` | — | API source. `data` is an array, or `{data, meta: {total}}` with server paging |
| `key` | string | `id` | Row id field (dot path allowed) |
| `columns` | Column[] | `[]` | See **Column** |
| `label` | string | "Table" | Accessible caption |
| `name` | string | primary column field | Field used to name a row in labels ("Select {name}", "Move {name}") |
| `every` | seconds | `0` | Live refresh (through `ctx.live`; pauses while hidden) |
| `live` | string[] | `[]` | Fields patched in place on refresh (`ago` columns are always live) |
| `toolbar` | toolbar config \| selector \| `false` | the `toolbar` right before the table | Embedded toolbar (rendered inside the table surface), a selector of a sibling toolbar, or none. An embedded toolbar gets `bulk` from `bulkActions` when it has none |
| `search` | `{fields}` | all visible columns | Fields the client search looks at (formatted text and raw values) |
| `filters` | Filter[] | — | How toolbar filters apply, see **Filter** |
| `paging` | `'client'` \| `'server'` \| `{mode, size, sizes}` | off | Paging; `size` default 25; `sizes` shows a page-size select |
| `sort` | `{field, dir}` | — | Default sort (`dir` `asc` \| `desc`) |
| `selectable` | bool | `false` | Checkboxes, shift-range, select page |
| `rowActions` | RowAction[] | `[]` | Inline icon buttons (`inline: true`) and the row menu |
| `bulkActions` | BulkAction[] | `[]` | Actions for the selection (shown by the toolbar's bulk bar) |
| `reloadOn` | string | — | Space-separated document events that refetch the source, e.g. `fs:saved` when a setting on the same page changes what the list shows |
| `toggle` | `{field, path, method, label, body, pending}` | — | Inline enable switch: optimistic, `PATCH path` with `{[field]: value}` (or `body` instead, e.g. `{}` for a flip endpoint), rollback + toast on error, then `fs:pending`. `field` may be a dot path |
| `reorder` | `{path, params, body, idsKey, field, method, pending}` | — | Drag handle + Move up/down: `POST path` with `{...body, ...pick(query, params), ids}`. `field` (e.g. `position`) is renumbered optimistically |
| `rowLink` | URL template | — | The primary cell becomes a link; a click anywhere on the row follows it (`FS.nav.go`; `#…` sets the hash) |
| `empty` | `{icon, title, text, action}` | inbox / "Nothing here yet" | `FS.states.empty` config when the source returns no rows |
| `group` | field \| `{field, label, labels, order, collapsed}` | — | Group rows under collapsible header rows |
| `locked` | field \| `{field, label}` | — | Rows with a truthy flag show a lock, cannot be selected, dragged, moved past, toggled, or run `api`/`danger` actions (unless `allowLocked`) |
| `chooser` | bool | `false` | Column chooser in the header (hidden columns remembered per `id`) |
| `id` | string | — | Key for remembered column choices |
| `count` | `[one, many]` | `['{n} row', '{n} rows']` | Footer count text |
| `skeleton` | number | `5` | Skeleton rows while loading |

Templates (`href`, `path`, `rowLink`, confirm texts) use `{field}` with dot
paths; `{id}` falls back to the `key` field. Path values are URL-encoded.

**Column**

| Key | Meaning |
|---|---|
| `field` | Dot path into the row |
| `label` | Header text (also the card label) |
| `format` | `text` (default), `num`, `bytes`, `bps`, `duration`, `ago`, `datetime`, `status`, `badge`, `chips`, `mono`, `bool`, `link` |
| `sub` | Second, muted line from another field (e.g. vendor under hostname) |
| `primary` | The row's title (card title, `th scope="row"`, `rowLink` target). Default: first visible column |
| `width` | CSS width of the column (e.g. `3rem`) |
| `align` | `start` \| `center` \| `end` (numbers default to `end`) |
| `sortable` | Click the header to sort asc → desc → default |
| `hidden` | Not shown (the chooser can show it) |
| `priority` | `1`/`2` always shown; `3` hidden below 64rem and in cards |
| `statusMap` | `status`: `{value: state}` or `{value: {state, label, detail}}`; keys are strings (`"true"`) |
| `variant` | `status`: `plain` \| `pill` \| `dot` |
| `badgeMap` | `badge`: `{value: {label, tone, icon}}`; `tone` default for all |
| `href` | `link`: URL template (default: the value) |
| `mono` | Monospace text for `text`/`badge`/`chips` |
| `itemField` | `chips`: field of object items to show (`entries: [{address, detail}]` → `address`) |
| `max` | `chips`: show at most this many, then "+n more" (the search still sees all) |
| `wrap` | Allow long values to wrap anywhere |

**Filter** — maps a toolbar filter id to the data

| Key | Meaning |
|---|---|
| `id` | Toolbar filter id |
| `field` | Client filter: row field (default: `id`). Arrays match any value; `''`, `all` and `[]` mean no filter |
| `match` | `eq` (default) or `contains` |
| `query` | A source query parameter instead: the value calls `setQuery({[query]: value})` (e.g. the firewall interface) |
| `param` | Server paging: query parameter name (default `id`); arrays are joined with commas |

**RowAction**

| Key | Meaning |
|---|---|
| `id`, `label`, `icon`, `danger` | As in page-header actions; `label` may use `{field}` |
| `inline` | Icon button in the row (table layout); always in the menu on cards |
| `href` | Link template (partial navigation) |
| `api` | `{method, path, body, success, pending, confirm}`; `confirm` is a title string or `{title, text, confirmLabel, danger, typed}` (`typed: true` uses `danger-confirm` with the row name; or a template) |
| `when` | `{field, value}` / `{field, not}` — show only for matching rows |
| `allowLocked` | Allow `api`/`danger` actions on locked rows |

Without `href`/`api` the action only emits `fs:row-action`.

**BulkAction**: `{id, label, icon, danger, confirm, success, pending, api}` with
`api: {method, path, body}` called once per selected row (path template, 4 at
a time), or `api: {method, path, body, ids: true | '<key>'}` for one call with
the selected keys. `confirm.title`/`text`/`success` may use `{n}`. Without
`api` only `fs:bulk-action` is emitted.

## Builder (PHP, P4)

```php
// app/pages/Rules.php (abridged): the real rules API, where ids are positions.
$ui->dataTable()
   ->source(['path' => '/v1/firewall/rules', 'query' => ['interface' => $tab]])
   ->key('id')
   ->columns([
       ['field' => 'type', 'label' => gettext('Action'), 'format' => 'badge', 'badgeMap' => $actions],
       ['field' => 'descr', 'label' => gettext('Description'), 'primary' => true, 'sub' => 'display.protocol'],
       ['field' => 'display.source', 'label' => gettext('Source'), 'mono' => true],
       ['field' => 'display.destination', 'label' => gettext('Destination'), 'mono' => true],
   ])
   ->toolbar(['search' => true, 'filters' => [['id' => 'interface', 'all' => false, 'value' => $tab,
       'href' => Url::page('/security/rules/{value}'),
       'options' => ['source' => ['path' => '/v1/firewall/rules/tabs'], 'value' => 'id', 'label' => 'label', 'count' => 'count']]]])
   ->toggle(['field' => 'display.enabled', 'method' => 'POST', 'path' => '/v1/firewall/rules/{id}/toggle', 'body' => (object)[]])
   ->reorder(['path' => '/v1/firewall/rules/order', 'params' => ['interface'], 'idsKey' => 'order'])
   ->rowActions([['id' => 'delete', 'label' => gettext('Delete'), 'icon' => 'trash', 'danger' => true,
       'api' => ['method' => 'DELETE', 'path' => '/v1/firewall/rules/{id}', 'pending' => true, 'confirm' => gettext('Delete this rule?')]]]);
```

The table reloads after a reorder (the server's order is the truth, and keys
may be positions that just changed) and after every row action.

A toolbar placed directly before the table (as above, or in the same card) is
wired automatically; `->toolbar([...])` embeds one inside the table surface.

## Instance API

`FS.el.get(node)`:

| Method | Effect |
|---|---|
| `reload()` | Fetch now; keeps the rows until the answer arrives (Promise) |
| `getSelection()` | Selected row keys |
| `getSelectedRows()` | Selected rows |
| `clearSelection()` | Clear the selection |
| `setFilter(id, value)` | Apply a filter (and update the toolbar) |
| `setSearch(text)` | Apply a search (and update the toolbar) |
| `setQuery(params)` | Merge source query parameters (`null` removes one), clear the selection, show skeleton rows, load |
| `getQuery()` | Current source query |
| `setSort(field, dir)` | Sort (`null` = default order) |
| `page(n?)` | Current page, or go to page `n` |
| `rows()` / `visibleRows()` | Loaded rows / rows on screen |

## Events (jQuery, bubble from the table node)

| Event | Detail |
|---|---|
| `fs:table-loaded` | `{rows, total, first, meta}` after every successful load |
| `fs:row-action` | `{id, key, row}` before an action runs; `preventDefault()` cancels its `api` call |
| `fs:bulk-action` | `{id, keys, rows}`; `preventDefault()` cancels the `api` call |
| `fs:selection` | `{ids, count}` |
| `fs:toggle` | `{id, field, value, response}` after a successful switch |
| `fs:reorder` | `{ids}` after the order was saved |
| `fs:done` | `{id, key, response}` after a row action's request |
| `fs:pending` | `{path, …}` after a write that needs Apply (toggle, reorder, bulk, and actions whose response has `meta.pending`) |

Listens on its toolbar: `fs:search`, `fs:filter`, `fs:selection-clear`, and
`fs:action` with `bulk: true` (matched to `bulkActions` by id). Reports the
selection with the toolbar's `setSelection(n)`.

## States

Skeleton rows while loading (also after `setQuery`), `FS.states.error` with
retry when the first load fails, stale marking (`data-fs-stale`) when a later
refresh fails, the configured empty state, and a "No matching rows" state with
"Clear search and filters" when search or filters hide everything.

## Skins and density

`html[data-fs-skin-tables]`: `lines` (hairlines, default), `zebra` (tinted
even rows), `minimal` (no row lines). Row height is `--fs-row-h`, so compact
density works. Inside a `card` the table drops its own border.

## Accessibility

- Real table semantics: `<caption>`, `th scope="col"`, the primary cell is `th scope="row"`; group rows use `th scope="colgroup"` with a toggle button (`aria-expanded`).
- Sortable headers are buttons; the sorted header has `aria-sort`. Sort changes are announced.
- Checkboxes are labelled "Select {name}"; the header box selects the page (indeterminate when partial). Shift+click selects a range. The selection count is announced by the toolbar (or by the table's own polite live region without one).
- The switch is `role="switch"` labelled "{label}: {name}". Locked rows show a lock icon with text.
- Row action buttons and the menu toggle are labelled with the row name ("Actions for {name}"). The menu is a Bootstrap dropdown (arrow keys, Escape, focus return) that also holds Move up / Move down.
- The drag handle is a button: ArrowUp/ArrowDown moves the row; moves are announced ("{name} moved to position 3 of 9"). Reorder is disabled (and explained) while searching, filtering or sorting.
- `rowLink` is a real link in the primary cell, so Enter and middle-click work.
- Touch targets grow to 40 px on coarse pointers. Live cells flash only without `prefers-reduced-motion`.
