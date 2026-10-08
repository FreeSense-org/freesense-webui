# danger-confirm

Type-to-confirm for destructive or disruptive actions: reset the state table,
delete an alias that rules use, factory reset. The confirm button stays
disabled until the user types the object's name exactly (case-sensitive).

## Programmatic API

```js
import { dangerConfirm } from '../danger-confirm/danger-confirm.js';

if (await dangerConfirm({ title: 'Reset the state table', text: '…', name: 'fw01.home.arpa', confirmLabel: 'Reset states' })) { … }
```

Resolves `true` only after the name was typed and the button (or Enter) was
pressed. **Temporary bridge:** `window.FS.dangerConfirm`.

## Config (API and element)

| Option | Type | Default | Meaning |
|---|---|---|---|
| `title` | string | `Are you sure?` | The action, as the dialog title |
| `text` | string | — | What will happen |
| `details` | string[] | — | Affected objects |
| `name` | string | — | Text that must be typed (object name, hostname) |
| `prompt` | string | `To confirm, type` | Label before the name |
| `confirmLabel` | string | `Delete` | |
| `cancelLabel` | string | `Cancel` | |
| `icon` (API) / `dialogIcon` (element) | Font Awesome name | `triangle-exclamation` | |

The element adds the same trigger and request options as `confirm`
(`label`, `icon`, `iconOnly`, `variant`, `size`, `action`, `success`); the
trigger is quiet red by default.

## Builder (PHP, P4)

```php
$ui->dangerConfirm(gettext('Reset the state table'))->icon('eraser')
   ->title(gettext('Reset the state table'))->text(gettext('Every open connection is dropped.'))
   ->name($hostname)->confirmLabel(gettext('Reset states'))->action('POST', '/v1/diagnostics/states/reset');
```

## Instance API

`FS.el.get(node).ask()` → Promise.

## Events

As `confirm`: `fs:confirm`, `fs:done`, `fs:failed` on the node; `fs:pending` on the document.

## Accessibility

- The input has a real label containing the name (in `<code>`) and is described by "This cannot be undone."
- Focus starts in the input; Enter confirms only when the name matches; Escape cancels.
- The disabled state of the button is real (`disabled`), so it is announced.
