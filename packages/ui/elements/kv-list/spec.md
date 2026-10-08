# kv-list

Key/value details: label left, value right (or stacked). Static items, or fields
mapped from an API source. Live sources update the values in place, so focus
and copy buttons survive each refresh. Narrow containers (< 17.5 rem) stack the
label above the value automatically; `columns: 2` applies from a 36 rem wide
container.

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `items` | Field[] with `value` | — | Static rows |
| `source` | `{path, query}` | — | API source (`FS.batch.get`), e.g. `{path: '/status/system'}` |
| `every` | seconds | `0` | Refresh interval (0 = once) |
| `fields` | Field[] | `[]` | Mapping from the response to rows |
| `columns` | `1` \| `2` | `1` | Two columns in wide containers |
| `layout` | `inline` \| `stacked` | `inline` | `stacked`: label above value |
| `empty` | `{icon, title, text}` | "No details" | Empty state |

**Field**

| Key | Meaning |
|---|---|
| `path` | Dotted path into the response (`cpu.model`, `temps.0.c`) |
| `label` | Visible label |
| `format` | `text` (default), `bytes`, `bps`, `num`, `compact`, `pct`, `duration` (seconds), `ago`, `datetime`, `time`, `status` |
| `of` | Path of a total: renders "3.0 GiB of 8.0 GiB" (numeric formats) |
| `scale` | Multiply numbers first (e.g. `1048576` for MiB values with `bytes`) |
| `unit` | Unit text after the value (numeric formats split their own unit) |
| `map` | For `status`: `{value: {state, label}}`; otherwise the value is used as state (or `{state, label, detail}` objects) |
| `copyable` | Adds a copy-to-clipboard button (copies the raw value) |
| `mono` | Monospace value (keys, addresses, MACs) |
| `href` | Value becomes a link (partial navigation) |
| `hint` | Tooltip on the label |
| `hideEmpty` | Hide the row while the value is empty |

Arrays render comma-separated, booleans as Yes/No, empty values as "—".
`ago` and `datetime` values carry the full date as a tooltip.

## Builder (PHP, P4)

```php
$ui->kvList()->source('/status/system')->every(5)->columns(2)
   ->field('hostname', gettext('Hostname'))->copyable()
   ->field('uptime', gettext('Uptime'), 'duration')
   ->field('memory.used', gettext('Memory'), 'bytes')->of('memory.total')->scale(1048576);
```

## Instance API

| Method | Effect |
|---|---|
| `reload()` | Fetch the source now |
| `set(items)` | Static lists: replace the items |
| `update(data)` | Render a response object through the field mapping |

## States

Loading (skeleton), empty, error with retry and stale (last values dimmed)
through `FS.states.load`.

## Accessibility

- A real `<dl>`: `<dt>` label, `<dd>` value.
- Copy buttons have `aria-label` "Copy <label>"; success is announced in a polite live region and shown as a check icon for 1.5 s.
- Status values use the `status` element (icon + text). Live values are not announced on every tick.
