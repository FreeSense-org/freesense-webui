# field-secret

A password, pre-shared key or token. Hidden by default; the eye button reveals it. `generate` adds a button that fills a random value from `crypto.getRandomValues` (no modulo bias) and reveals it.

Schema type `secret`. The [form](../form/spec.md) builds it from the
resource schema ([schema.md](../form/schema.md)); the element `field-secret` renders
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
| `generate` | `true` \| `{length, charset}` | — | Generator; `charset`: `alnum` (default, no look-alikes), `hex`, `base64`, `strong` |
| `mono` | bool | `true` | Monospace |
| `autocomplete` | string | `new-password` | Browser hint |

## Builder (PHP, P4)

```php
$ui->fieldSecret('psk', gettext('Pre-shared key'))->generate(32, 'base64')->required();
```

## Instance API

`FS.el.get(node)` returns `{ get(), set(value), validate(), setError(message), setDisabled(bool), focus() }`.
`validate()` runs the same checks as the form and shows the inline error; it returns the error entries (empty when valid).

## Events

`fs:change` [value] on the node after every user edit (standalone element). Inside a form the form handles changes.

## Accessibility

The visible label is a `<label for>`; help and error text are linked with `aria-describedby`, an invalid input gets `aria-invalid`. Errors show an icon and text. The reveal button is a toggle (`aria-pressed`, label Show/Hide); both buttons have accessible names.
