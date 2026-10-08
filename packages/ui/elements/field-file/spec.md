# field-file

Pick or drop one file. `accept` and `maxSize` are checked before anything is sent. With `upload: {path}` the file is POSTed as multipart with progress and the value is the response data (e.g. `{id, name, size}`), which the form then saves. With `read: "text"` (or `"dataurl"`) the file is read in the browser and the value is `{name, size, type, content}` (certificates, keys, configuration imports).

Schema type `file`. The [form](../form/spec.md) builds it from the
resource schema ([schema.md](../form/schema.md)); the element `field-file` renders
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
| `accept` | string | — | e.g. `.pem,.crt` or `image/*` |
| `maxSize` | number | — | Bytes |
| `upload` | `{path, query}` | — | Upload endpoint (`name` and `size` are added to the query) |
| `uploadField` | string | `file` | Multipart field name |
| `read` | `text` \| `dataurl` | `text` | Without `upload` |

## Builder (PHP, P4)

```php
$ui->fieldFile('cert', gettext('Certificate'))->accept('.pem,.crt')->maxSize(65536)->upload('/v1/system/certificates/upload');
```

## Instance API

`FS.el.get(node)` returns `{ get(), set(value), validate(), setError(message), setDisabled(bool), focus() }`.
`validate()` runs the same checks as the form and shows the inline error; it returns the error entries (empty when valid).

## Events

`fs:change` [value] on the node after every user edit (standalone element). Inside a form the form handles changes.

## Accessibility

The visible Choose file button carries the label; the native input is hidden. Progress is a `role=progressbar` with a value (indeterminate while the size is unknown). Remove has an accessible name. Rejected files show an inline error right away.
