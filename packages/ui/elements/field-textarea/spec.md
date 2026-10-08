# field-textarea

Multi-line text. `code: true` gives a monospace, non-wrapping editor with a line count for certificates, keys and custom options. `maxLength` adds a character counter.

Schema type `textarea`. The [form](../form/spec.md) builds it from the
resource schema ([schema.md](../form/schema.md)); the element `field-textarea` renders
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
| `rows` | number | `3` (`6` in code mode) | Height |
| `code` | bool | `false` | Monospace, no wrap, line count, no spellcheck |
| `maxLength` | number | — | Limit with counter |
| `placeholder` | string | — | Example |

## Builder (PHP, P4)

```php
$ui->fieldTextarea('leapsec', gettext('Leap seconds'))->code()->rows(5);
```

## Instance API

`FS.el.get(node)` returns `{ get(), set(value), validate(), setError(message), setDisabled(bool), focus() }`.
`validate()` runs the same checks as the form and shows the inline error; it returns the error entries (empty when valid).

## Events

`fs:change` [value] on the node after every user edit (standalone element). Inside a form the form handles changes.

## Accessibility

The visible label is a `<label for>`; help and error text are linked with `aria-describedby`, an invalid input gets `aria-invalid`. Errors show an icon and text. The counter is decorative (`aria-hidden`); the limit itself is `maxlength`.
