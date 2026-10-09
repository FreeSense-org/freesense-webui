# field-switch

A boolean. The label sits above like every field; the optional `text` caption next to the switch says what "on" means. Without a caption the switch shows On/Off. `values: [off, on]` maps the boolean to other values.

Schema type `switch`. The [form](../form/spec.md) builds it from the
resource schema ([schema.md](../form/schema.md)); the element `field-switch` renders
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
| `text` | string | — | Caption next to the switch (also clickable) |
| `values` | `[off, on]` | `[false, true]` | Stored values. Without `values`, a loaded `"yes"` or `"on"` (checkbox fields as the API returns them) also counts as on |

## Builder (PHP, P4)

```php
$ui->fieldSwitch('log', gettext('Log'))->text(gettext('Log packets that match this rule'));
```

## Instance API

`FS.el.get(node)` returns `{ get(), set(value), validate(), setError(message), setDisabled(bool), focus() }`.
`validate()` runs the same checks as the form and shows the inline error; it returns the error entries (empty when valid).

## Events

`fs:change` [value] on the node after every user edit (standalone element). Inside a form the form handles changes.

## Accessibility

A native checkbox with `role=switch`, labelled by the field label and the caption.
