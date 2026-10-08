# field-checklist

Several values from a list, as visible checkboxes. Short lists flow into columns; long lists (more than 8 or `searchable: true`) get a filter box and scroll inside the field. A counter and Select all / Clear sit on top. The value is an array in option order; values that are not in the options are kept.

Schema type `checklist`. The [form](../form/spec.md) builds it from the
resource schema ([schema.md](../form/schema.md)); the element `field-checklist` renders
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
| `options` | array \| object | `[]` | As for select |
| `searchable` | bool | auto (> 8) | Filter box |
| `inline` | bool | `false` | One column even for short lists |
| `minItems` / `maxItems` | number | — | Count limits |

## Builder (PHP, P4)

```php
$ui->fieldChecklist('interfaces', gettext('Interfaces'))->source('/v1/status/interfaces', 'id', 'descr');
```

## Instance API

`FS.el.get(node)` returns `{ get(), set(value), validate(), setError(message), setDisabled(bool), focus() }`.
`validate()` runs the same checks as the form and shows the inline error; it returns the error entries (empty when valid).

## Events

`fs:change` [value] on the node after every user edit (standalone element). Inside a form the form handles changes.

## Accessibility

A labelled `role=group` of native checkboxes, each with its own label (and detail). The counter is a polite live region. Select all / Clear act on the visible (filtered) options.
