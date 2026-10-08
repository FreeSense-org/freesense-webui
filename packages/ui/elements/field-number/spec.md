# field-number

A number with `min`, `max`, `step` and a unit shown as a suffix. Empty is `null`. Whole numbers by default; `step: "any"` allows decimals.

Schema type `number`. The [form](../form/spec.md) builds it from the
resource schema ([schema.md](../form/schema.md)); the element `field-number` renders
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
| `min` / `max` | number | — | Range (checked on save, with a message) |
| `step` | number \| `any` | `1` | Step; integers unless `any` or a decimal step |
| `unit` | string | — | Unit suffix, e.g. `ms`, `bytes` |
| `placeholder` | string | — | e.g. `No limit` |

## Builder (PHP, P4)

```php
$ui->fieldNumber('mtu', gettext('MTU'))->range(576, 9000)->unit('bytes');
```

## Instance API

`FS.el.get(node)` returns `{ get(), set(value), validate(), setError(message), setDisabled(bool), focus() }`.
`validate()` runs the same checks as the form and shows the inline error; it returns the error entries (empty when valid).

## Events

`fs:change` [value] on the node after every user edit (standalone element). Inside a form the form handles changes.

## Accessibility

The visible label is a `<label for>`; help and error text are linked with `aria-describedby`, an invalid input gets `aria-invalid`. Errors show an icon and text. `inputmode` is numeric (decimal with a decimal step).
