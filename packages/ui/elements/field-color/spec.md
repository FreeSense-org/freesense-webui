# field-color

Pick an accent from the active theme's list (read from the theme's `theme.json`). Those accents are contrast-checked in light and dark (RULES R5), so free colours are not offered. Swatches follow the current mode. `allowDefault` adds Theme default (value `null`).

Schema type `color`. The [form](../form/spec.md) builds it from the
resource schema ([schema.md](../form/schema.md)); the element `field-color` renders
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
| `allowDefault` | bool | `false` | Offer Theme default |
| `theme` | string | active theme | Another theme's accents |

## Builder (PHP, P4)

```php
$ui->fieldColor('accent', gettext('Accent colour'))->allowDefault();
```

## Instance API

`FS.el.get(node)` returns `{ get(), set(value), validate(), setError(message), setDisabled(bool), focus() }`.
`validate()` runs the same checks as the form and shows the inline error; it returns the error entries (empty when valid).

## Events

`fs:change` [value] on the node after every user edit (standalone element). Inside a form the form handles changes.

## Accessibility

A labelled radiogroup of native radios; every swatch has its name as text, so colour is never the only signal.
