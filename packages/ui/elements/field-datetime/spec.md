# field-datetime

A date, a time or both, with the browser's native pickers. `range: true` shows two inputs (from → to) and checks that the end is after the start; `days: true` adds weekday toggles for schedules. Values are local ISO strings.

Schema type `datetime`. The [form](../form/spec.md) builds it from the
resource schema ([schema.md](../form/schema.md)); the element `field-datetime` renders
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
| `mode` | `datetime` \| `date` \| `time` | `datetime` | Input type |
| `range` | bool | `false` | Value `{from, to}` |
| `days` | bool | `false` | With `range`: value `{days: ['mon', …], from, to}` |
| `min` / `max` / `step` | string / number | — | Native limits |

## Builder (PHP, P4)

```php
$ui->fieldDatetime('window', gettext('Schedule'))->mode('time')->range()->days();
```

## Instance API

`FS.el.get(node)` returns `{ get(), set(value), validate(), setError(message), setDisabled(bool), focus() }`.
`validate()` runs the same checks as the form and shows the inline error; it returns the error entries (empty when valid).

## Events

`fs:change` [value] on the node after every user edit (standalone element). Inside a form the form handles changes.

## Accessibility

Native inputs with From/To names; weekday toggles are labelled checkboxes in a group. Incomplete input is reported as an error.
