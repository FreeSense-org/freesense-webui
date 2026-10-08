# toolbar

Sits above a collection (usually a `data-table`): a debounced search box,
filter selects and chips, an optional view switch, right-aligned actions and a
bulk-action bar. While the parent reports a selection (`setSelection(n)`), the
bulk bar replaces search and filters.

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `search` | bool \| `{placeholder, value, delay, label}` | — | Search box; `delay` in ms (default 250) |
| `filters` | Filter[] | `[]` | Selects and chip groups |
| `view` | view-switch config | — | Nested `view-switch` (size `sm`) before the actions |
| `actions` | Action[] | `[]` | Right-aligned buttons; set `variant: 'primary'` on the main one |
| `bulk` | Action[] | `[]` | Bulk actions shown while items are selected |
| `selection` | number | `0` | Initial selection count |
| `label` | string | "Collection tools" | Accessible name of the toolbar |

**Filter**

| Key | Meaning |
|---|---|
| `id` | Filter key in events and `values()` |
| `type` | `select` (default) or `chips` |
| `label` | Accessible name (select: also the "Label: All" option) |
| `options` | `[{value, label, icon, count}]` |
| `value` | Initial value (array for multiple chips) |
| `multiple` | Chips: toggle several (`aria-pressed`) instead of one |
| `all` | Select: text of the empty option, or `false` for none |

## Builder (PHP, P4)

```php
$ui->toolbar()->search(gettext('Search rules'))
   ->chips('action', gettext('Action'), [['pass', gettext('Pass')], ['block', gettext('Block')]], multiple: true)
   ->select('proto', gettext('Protocol'), [['tcp', 'TCP'], ['udp', 'UDP']])
   ->action('add', gettext('Add rule'), 'plus', variant: 'primary')
   ->bulk('delete', gettext('Delete'), 'trash-can', danger: true);
```

A `data-table` wires itself to the toolbar above it: it listens to
`fs:search`/`fs:filter` and calls `setSelection(n)` when rows are selected.

## Instance API

| Method | Effect |
|---|---|
| `setSelection(n)` | Show the bulk bar for n items (0 hides it) |
| `values()` | `{q, filters}` |
| `setSearch(text)` | Set the search text (no event) |
| `setFilter(id, value)` | Set a filter value (no event) |

## Events

| Event | Detail |
|---|---|
| `fs:search` | `{q}`, debounced; Enter fires at once; Escape clears |
| `fs:filter` | `{id, value, values}` |
| `fs:action` | `{id, bulk, selection?}` (`bulk: true` from the bulk bar, with the count) |
| `fs:selection-clear` | `{}` from the bulk bar's Clear button; the parent clears its selection and calls `setSelection(0)` |
| `fs:view` | from the nested view switch |

## Accessibility

- `role="toolbar"` with a label; the search box and selects have labels.
- Chips are toggle buttons with `aria-pressed`, grouped and labelled.
- Selection changes are announced in a polite live region ("3 selected").
- On phones the search takes the full width; chips grow to 40 px touch targets on coarse pointers.
