# field-segmented

A small set (2–5) of exclusive options as one segmented control, built on native radios. Options can carry an `icon` and a `tone` (`pass`, `block`, `reject`, `match`, `ok`, `warn`, `crit`) that colours the selected option — always together with its text.

Schema type `segmented`. The [form](../form/spec.md) builds it from the
resource schema ([schema.md](../form/schema.md)); the element `field-segmented` renders
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
| `options` | array | `[]` | `[{value, label, icon, tone, detail, disabled}]` |

## Builder (PHP, P4)

```php
$ui->fieldSegmented('action', gettext('Action'))->options(['pass' => gettext('Pass'), 'block' => gettext('Block')]);
```

## Instance API

`FS.el.get(node)` returns `{ get(), set(value), validate(), setError(message), setDisabled(bool), focus() }`.
`validate()` runs the same checks as the form and shows the inline error; it returns the error entries (empty when valid).

## Events

`fs:change` [value] on the node after every user edit (standalone element). Inside a form the form handles changes.

## Accessibility

A labelled `role=radiogroup` of native radios: Tab enters, arrow keys move, focus ring on the selected segment. Colour never stands alone (icon + text).
