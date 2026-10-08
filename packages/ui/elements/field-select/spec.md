# field-select

One value from a list. Up to 10 options render as a native `<select>`; longer lists (or `searchable: true`) become a searchable combobox with groups and details. Options are static or loaded from an API source. Values keep their type (numbers stay numbers).

Schema type `select`. The [form](../form/spec.md) builds it from the
resource schema ([schema.md](../form/schema.md)); the element `field-select` renders
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
| `options` | array \| object | `[]` | `[{value, label, group, detail, disabled}]`, plain strings, or `{source: {path, query}, value, label, group, detail, prepend, append}` |
| `placeholder` | string | `Choose…` / `None` | Empty choice text |
| `searchable` | bool | auto (> 10) | Force or prevent the combobox |
| `strict` | bool | `true` | Reject values that are not in the options |
| `multiple` | bool | `false` | Several values (renders a checklist) |

## Builder (PHP, P4)

```php
$ui->fieldSelect('interface', gettext('Interface'))->source('/v1/status/interfaces', 'id', 'descr')->required();
```

## Instance API

`FS.el.get(node)` returns `{ get(), set(value), validate(), setError(message), setDisabled(bool), focus() }`.
`validate()` runs the same checks as the form and shows the inline error; it returns the error entries (empty when valid).

## Events

`fs:change` [value] on the node after every user edit (standalone element). Inside a form the form handles changes.

## Accessibility

Native select below 11 options. The combobox is a button (`aria-haspopup=listbox`, `aria-expanded`) that opens a search box (`role=combobox`, `aria-activedescendant`) over a `listbox`; arrows move, Enter picks, Escape closes and returns focus to the button.
