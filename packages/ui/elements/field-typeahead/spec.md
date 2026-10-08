# field-typeahead

Free text with suggestions from an API source (`source: {path, query, param, value, label, detail, group}`, the last four being dot paths into each row) or a static `suggestions` list. `strict: true` accepts only a suggested (or the initial) value.

Schema type `typeahead`. The [form](../form/spec.md) builds it from the
resource schema ([schema.md](../form/schema.md)); the element `field-typeahead` renders
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
| `source` | `{path, query, param, value, label, detail, group}` | — | `param` (default `q`) carries the typed text; `value`, `label`, `detail`, `group` are dot paths into each row |
| `suggestions` | array | — | Static list (strings or objects) |
| `minChars` | number | `1` | Characters before suggesting |
| `strict` | bool | `false` | Only suggested values |

## Builder (PHP, P4)

```php
$ui->fieldTypeahead('alias', gettext('Alias'))->source('/v1/firewall/aliases', value: 'name', detail: 'descr');
```

## Instance API

`FS.el.get(node)` returns `{ get(), set(value), validate(), setError(message), setDisabled(bool), focus() }`.
`validate()` runs the same checks as the form and shows the inline error; it returns the error entries (empty when valid).

## Events

`fs:change` [value] on the node after every user edit (standalone element). Inside a form the form handles changes.

## Accessibility

Combobox pattern (`aria-autocomplete=list`, `aria-activedescendant`); a polite status announces the number of suggestions.
