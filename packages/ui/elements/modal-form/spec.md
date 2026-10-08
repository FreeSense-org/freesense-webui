# modal-form

A small form in a dialog (add an alias, edit a description, rename a
dashboard): fields from config, submitted through `FS.api`, API validation
errors (422 `error.details.fields`) shown next to the inputs. Larger forms use
the schema form of the forms group.

## Programmatic API

```js
import { modalForm } from '../modal-form/modal-form.js';

const res = await modalForm({ title: 'Add alias', method: 'POST', path: '/v1/firewall/aliases', fields: [...] });
if (res) table.reload();       // res = {data, meta}; null when cancelled
```

**Temporary bridge:** `window.FS.modalForm`.

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `title` | string | — | Dialog title |
| `text` | string | — | Short intro above the fields |
| `fields` | Field[] | `[]` | See below |
| `values` | object | `{}` | Initial values by field name |
| `method` | `POST` \| `PUT` \| `PATCH` | `POST` | |
| `path` | string | — | Endpoint (`/v1/…`) |
| `submitLabel` / `cancelLabel` | string | `Save` / `Cancel` | |
| `success` | string | — | Toast text when the response has no `meta.message` |
| `transform` | function (API only) | — | Map the values before sending |
| `icon` (API) / `dialogIcon` (element) | Font Awesome name | — | Icon next to the title |

**Field:** `{ name, type, label, help, required, placeholder, value, … }`

| `type` | Extra keys | Value sent |
|---|---|---|
| `text` (default) | `maxlength`, `mono`, `inputType` (`email`, `url`…), `autocomplete` | trimmed string |
| `number` | `min`, `max`, `step` | number or `null` |
| `select` | `options: [{value, label}]` or `['a','b']` | string |
| `switch` | — | boolean |
| `textarea` | `rows`, `mono` | trimmed string |

The client checks only `required`; every other rule belongs to the API. On a
422 each `fields[name]` message is shown under its input, the first invalid
input is focused, and `error.message` shows in an alert at the top (with any
messages for unknown fields). Other errors show in the alert and keep the
dialog open. On success: toast, `fs:pending` when `meta.pending`, close,
resolve with the response.

### Element only

The element is a trigger button: `label`, `icon`, `iconOnly`, `variant`
(default `primary`), `size`, plus all options above.

## Builder (PHP, P4)

```php
$ui->modalForm(gettext('Add alias'))->icon('plus')->title(gettext('Add alias'))
   ->post('/v1/firewall/aliases')->submitLabel(gettext('Create alias'))
   ->text('name', gettext('Name'))->required()->help(gettext('Letters, digits and underscores.'))
   ->select('type', gettext('Type'), ['host' => gettext('Hosts'), 'network' => gettext('Networks')])
   ->switch('log', gettext('Log matches'));
```

## Instance API

`FS.el.get(node).open(extraConfig)` → Promise (e.g. `open({ values: row })` to edit a row).

## Events

On the node: `fs:saved [response]`. On the document: `fs:pending [{ path }]`.

## Accessibility

- Every input has a `<label>`; help and error texts are linked with `aria-describedby`; invalid inputs get `aria-invalid`.
- Required fields are marked visually (*) and with `aria-required`.
- Enter submits; the backdrop is static (no accidental loss of typed data) but Escape and Cancel close.
- Focus starts in the first field and returns to the trigger.
