# toast

Transient result messages ("Firewall rules reloaded", "Alias WEB_SERVERS
deleted · Undo"). Stacked bottom-right, full width at the bottom on phones,
newest at the bottom, at most four at a time.

Pages rarely place the element themselves: the shell emits one host, and
every other element calls the API. When no host exists the API creates one
on `<body>`.

## Programmatic API

```js
import { toast } from '../toast/toast.js';

toast('Firewall rules reloaded', { level: 'ok' });
toast('Alias WEB_SERVERS deleted', { level: 'ok', action: { label: 'Undo', onClick: (t) => restore() } });
toast.error(e);                 // a normalised FS.api error → critical toast with e.message
toast.ok(m, o) / toast.info / toast.warn / toast.crit
toast.clear();
const t = toast('…'); t.close();
```

| Option | Type | Default | Meaning |
|---|---|---|---|
| `level` | `ok` \| `info` \| `warn` \| `crit` (aliases `success`, `warning`, `error`, `danger`) | `info` | Icon, colour and screen-reader prefix |
| `title` | string | — | Bold first line |
| `action` | `{ label, onClick(handle) }` | — | One text button (Undo, View); the toast closes after the click |
| `timeout` | seconds, `0` = sticky | ok 5, info 6, warn 8, **crit 0**; 10 with an action | Auto-dismiss time |
| `icon` | Font Awesome name | per level | Override the icon |
| `returnFocus` | Element | — | Focus target when the toast closes while focused |
| `onClose` | function | — | Called once when it closes |

The same message at the same level is not stacked twice: the existing toast
shows a counter (×2) and restarts its timer.

**Temporary bridge:** on load the module sets `window.FS.toast = toast` (when
not present yet). The runtime should import it and expose it itself; the
bridge then becomes a no-op. Code without module access can also trigger
`$(document).trigger('fs:toast', [{ message, level, … }])`.

## Element config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `label` | string | `Notifications` | Accessible name of the region |
| `inline` | bool | `false` | Static preview (gallery, docs): not fixed, not live, never receives API toasts |
| `toasts` | `[{ message, …options }]` | `[]` | Toasts to show at start |
| `demo` | bool | `false` | Gallery only: buttons that trigger sample toasts |

## Builder (PHP, P4)

```php
$ui->toast();                                      // the shell emits this once
$ui->toast()->inline()->toasts([['message' => gettext('Rules reloaded'), 'level' => 'ok']]);
```

## Instance API

`FS.el.get(node)`: `toast(message, opts)` (into this host), `clear()`.

## Events

`fs:toast` on the document (input, see above).

## Accessibility

- The host is a `region` with `aria-live="polite"` and `aria-relevant="additions"`; each toast starts with a visually hidden level prefix ("Error: …"), so the level is never colour-only.
- Timers pause while the pointer is over a toast or focus is inside it; Escape closes the focused toast.
- Critical toasts stay until dismissed. The dismiss button is labelled; buttons grow to 40 px on phones.
- Enter/leave motion is transform/opacity only and stops under `prefers-reduced-motion`.
