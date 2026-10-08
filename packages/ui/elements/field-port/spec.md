# field-port

A TCP/UDP port (`443`), a range (`8000:8100`; `8000-8100` is accepted and normalised), a list (`22, 443`) or a port alias. Empty means any, stored as `emptyValue`. Suggests port aliases and well-known services; shows the service name or range size next to the input. A trailing label like `443 (HTTPS)` from older data is stripped.

Schema type `port`. The [form](../form/spec.md) builds it from the
resource schema ([schema.md](../form/schema.md)); the element `field-port` renders
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
| `emptyValue` | string | `''` | Value for "any" (e.g. `any`) |
| `range` | bool | `true` | Allow ranges and lists |
| `alias` | bool | `true` | Allow port aliases |

## Builder (PHP, P4)

```php
$ui->fieldPort('destination_port', gettext('Port'))->emptyValue('any');
```

## Instance API

`FS.el.get(node)` returns `{ get(), set(value), validate(), setError(message), setDisabled(bool), focus() }`.
`validate()` runs the same checks as the form and shows the inline error; it returns the error entries (empty when valid).

## Events

`fs:change` [value] on the node after every user edit (standalone element). Inside a form the form handles changes.

## Accessibility

Combobox pattern like the address field. The badge is decorative.
