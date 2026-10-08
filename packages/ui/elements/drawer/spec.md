# drawer

A side panel on the right for details and quick edits (a rule, a lease, a
service) without leaving the page. Title, optional subtitle and icon, a body
of nested element configs, and footer actions. Full screen on phones. One
drawer at a time: opening another replaces it.

The root class is `.fs-side-drawer` because the shell already owns
`.fs-drawer` for its navigation drawer.

## Programmatic API

```js
import { drawer } from '../drawer/drawer.js';

const d = drawer.open({ title: 'web01', body: [{ el: 'status', config: { state: 'ok', label: 'Online' } }] });
d.$body.append(myNode);   // or put nodes in body directly
d.close();  drawer.close();  drawer.current;
```

**Temporary bridge:** `window.FS.drawer = { open, close }`.

## Config (`open(config)`, or `drawer` in the element config)

| Option | Type | Default | Meaning |
|---|---|---|---|
| `title` | string | — | Heading (labels the dialog) |
| `subtitle` | string | — | Muted line under the title |
| `icon` | Font Awesome name | — | Tinted icon before the title |
| `size` | `md` \| `lg` | `md` | 28 rem or 40 rem wide |
| `body` | Item[] | `[]` | `{ el, config }` nested element · `{ heading }` group label · `{ text }` paragraph · a DOM node (API only) |
| `footer` | Action[] | one `Close` button; `[]` = no footer | See below |
| `onClose` | function (API only) | — | Called after closing |

**Action:** `{ label, variant, icon, href, nav, action: { method, path, body }, success, onClick(api), close }`.
A button without `href`, `action` or `onClick` closes the drawer. `action`
runs the request (busy state, toast, `fs:pending`) and closes on success.
`onClick` may return `false` to keep it open; with `close: true` it closes
afterwards.

### Element only

The element is a trigger button: `label`, `icon`, `iconOnly`, `variant`, `size`, `drawer`.

## Builder (PHP, P4)

```php
$ui->drawer(gettext('Details'))->icon('circle-info')->drawer([
    'title' => gettext('DNS Resolver'), 'subtitle' => 'unbound',
    'body' => [$ui->status('ok', gettext('Running'))->config()],
    'footer' => [['label' => gettext('Restart'), 'variant' => 'primary', 'action' => ['method' => 'POST', 'path' => '/v1/status/services/unbound/restart']]],
]);
```

## Instance API

`FS.el.get(node)`: `open(extraConfig)`, `close()`.

## Events

On the document: `fs:drawer-opened [{ id }]`, `fs:drawer-closed [{ id }]`. Nested elements are initialised and destroyed by `FS.el` as usual.

## Accessibility

- `role="dialog"`, `aria-modal="true"`, labelled by the title. Focus moves into the body (first control) or the close button, Tab is trapped, and focus returns to the opener.
- Escape, the labelled close button and the scrim close it. A dialog opened from the drawer (confirm, modal-form) handles Escape first.
- The page behind does not scroll while it is open. The slide uses transform only and stops under `prefers-reduced-motion`.
