# confirm

A confirmation dialog that replaces `window.confirm()` (RULES R3). Promise
based, built from Bootstrap modal markup in JS, removed from the DOM when
closed.

The module also exports the shared dialog helpers used by `danger-confirm`
and `modal-form`: `dialog()`, `button()`, `busy()`, `isBusy()`,
`bodyText()`, `runAction()` and `triggerButton()`.

## Programmatic API

```js
import { confirm } from '../confirm/confirm.js';

if (await confirm({ title: 'Delete alias WEB_SERVERS?', text: '…', confirmLabel: 'Delete', danger: true })) { … }
```

Resolves `true` when confirmed; `false` on Cancel, the close button, Escape
or a backdrop click. **Temporary bridge:** `window.FS.confirm`.

## Config (API and element)

| Option | Type | Default | Meaning |
|---|---|---|---|
| `title` | string | `Are you sure?` | The question, as the dialog title |
| `text` | string | — | Consequences, one short paragraph |
| `details` | string[] | — | List of affected objects (scrolls after ~6) |
| `confirmLabel` | string | `Confirm` | Verb for the action ("Delete", "Restart") |
| `cancelLabel` | string | `Cancel` | |
| `danger` | bool | `false` | Red confirm button, warning icon, focus starts on Cancel |
| `icon` (API) / `dialogIcon` (element) | Font Awesome name | warning icon when `danger` | Icon next to the title |

### Element only

The element is a button that asks first and then runs an API call.

| Option | Type | Default | Meaning |
|---|---|---|---|
| `label` | string | `Confirm` | Button text (also the accessible name when `iconOnly`) |
| `icon` | Font Awesome name | — | Button icon |
| `iconOnly` | bool | `false` | Icon-only button (needs `icon`) |
| `variant` | `primary` \| `secondary` \| `danger` \| `ghost` | `secondary`, quiet red with `danger` | Button style |
| `size` | `sm` | — | Small button |
| `action` | `{ method, path, body }` | — | Request after confirming (`path` as `/v1/…`) |
| `success` | string | — | Toast text when the response has no `meta.message` |

After the request: a success toast (`meta.message` or `success`),
`fs:pending` on the document when `meta.pending` is true, and `fs:done`
on the node. Failures show an error toast and trigger `fs:failed`.

## Builder (PHP, P4)

```php
$ui->confirm(gettext('Delete alias'))->icon('trash')->danger()
   ->title(sprintf(gettext('Delete alias %s?'), $name))->text(gettext('Rules that use this alias stop matching.'))
   ->confirmLabel(gettext('Delete'))->action('DELETE', "/v1/firewall/aliases/{$name}");
```

## Instance API

`FS.el.get(node).ask()` → Promise (opens the dialog as if clicked).

## Events

On the node: `fs:confirm [ok]`, `fs:done [response]`, `fs:failed [error]`. On the document: `fs:pending [{ path }]`.

## Accessibility

- `role="dialog"`/`aria-modal` from Bootstrap, labelled by the title and described by the body; focus is trapped while open and returns to the element focused before.
- Initial focus is the confirm button, or Cancel for `danger` so Enter never destroys by accident.
- Escape and the labelled close button cancel. While a request runs the trigger is `aria-busy` and ignores clicks without losing focus.
- On phones the buttons stack full width at 40 px.
