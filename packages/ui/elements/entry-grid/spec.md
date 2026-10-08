# entry-grid

Repeatable rows of sub-fields (alias entries, NTP servers, static routes, DNS overrides). Rows are added, removed and reordered with buttons, within `min` / `max`. Each cell is a normal field of any type, so validation, suggestions and 422 errors work per cell (`entries.2.value`, 0-based). Wide forms show a table-like grid with one header; narrow ones stack each row as a small card with its own labels.

Schema type `entry-grid`. The [form](../form/spec.md) builds it from the
resource schema ([schema.md](../form/schema.md)); the element `entry-grid` renders
one field on its own (config = the field schema plus `value` and `error`).

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `name` | string | — | Value key (dots nest in a form) |
| `label` | string | — | Visible label above the input |
| `help` | string | — | Help text under the input |
| `required` | bool | `false` | Must not be empty |
| `value` / `default` | any | — | Initial value |
| `disabled` / `readonly` | bool | `false` | Disabled |
| `error` | string | — | Initial inline error (standalone element) |
| `width` | `full` \| `half` \| `third` \| `two-thirds` | `full` | Column span inside a form |
| `fields` | Field[] | `[]` | Columns; `width`: `xs` \| `sm` \| `md` \| `lg` \| `xl` \| `auto` \| fr number |
| `min` / `max` | number | `0` / ∞ | Row limits (empty rows are added up to `min`) |
| `reorder` | bool | `true` | Move up/down buttons |
| `addLabel` | string | `Add entry` | Add button |
| `emptyText` | string | `No entries yet.` | Empty state |

## Builder (PHP, P4)

```php
$ui->entryGrid('entries', gettext('Entries'))->min(1)->max(200)
   ->column($ui->fieldText('value', gettext('Value'))->mono()->required())
   ->column($ui->fieldText('descr', gettext('Description')));
```

## Instance API

`FS.el.get(node)` returns `{ get(), set(value), validate(), setError(message), setDisabled(bool), focus() }`.
`validate()` runs the same checks as the form and shows the inline error; it returns the error entries (empty when valid).

## Events

`fs:change` [value] on the node after every user edit (standalone element). Inside a form the form handles changes.

## Accessibility

A labelled group. Every cell input is named `Column, row n`; move and remove buttons name their row. Adding focuses the new row, removing focuses the next row (or Add), moving keeps focus on the moved row. A polite live region announces each change.
