# field-text

Single-line text. Supports prefix/suffix add-ons, monospace for names and keys, and a `pattern` check with its own message.

Schema type `text`. The [form](../form/spec.md) builds it from the
resource schema ([schema.md](../form/schema.md)); the element `field-text` renders
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
| `placeholder` | string | — | Example value |
| `prefix` / `suffix` | string | — | Add-ons, e.g. `https://` |
| `mono` | bool | `false` | Monospace |
| `pattern` / `patternMessage` | string | — | Regex and its message |
| `minLength` / `maxLength` | number | — | Length limits |
| `inputType` | `text` \| `email` \| `url` \| `tel` | `text` | Input type |
| `trim` | bool | `true` | Trim the value |

## Builder (PHP, P4)

```php
$ui->fieldText('hostname', gettext('Host name'))->required()->mono()->pattern('^[a-z0-9-]{1,63}$', gettext('Use lower-case letters, digits and hyphens.'));
```

## Instance API

`FS.el.get(node)` returns `{ get(), set(value), validate(), setError(message), setDisabled(bool), focus() }`.
`validate()` runs the same checks as the form and shows the inline error; it returns the error entries (empty when valid).

## Events

`fs:change` [value] on the node after every user edit (standalone element). Inside a form the form handles changes.

## Accessibility

The visible label is a `<label for>`; help and error text are linked with `aria-describedby`, an invalid input gets `aria-invalid`. Errors show an icon and text.
