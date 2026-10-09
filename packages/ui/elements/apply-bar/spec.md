# apply-bar

A sticky bar that appears while saved changes are not active yet (firewall
rules, NAT, aliases, shaper): "Firewall changes are pending · 3 changes",
Apply and optional Discard. Hidden when nothing is pending.

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `source` | `{ path, query }` | `{ path: '/v1/firewall/pending' }` | Pending endpoint. `data` may be `{pending: bool}`, `{pending: n}`, `{pending: [subsystem, …]}` (the firewall API), `{count: n}` or `{changes: [...]}` |
| `only` | string \| string[] | — | With `{pending: [subsystem, …]}`: count only these subsystems (e.g. `aliases` on the Aliases page) |
| `every` | seconds | `10` | Poll interval (through `ctx.live`) |
| `apply` | `{ method, path, body }` | `{ method: 'POST', path: '/v1/firewall/apply' }` | Apply request |
| `discard` | `{ method, path, body, label, success, confirm }` | — | Shows Discard. `confirm`: `{title, text, confirmLabel}` or `false` (no question) |
| `text` | string | `Changes are pending` | Main line; the count is appended |
| `detail` | string | `They are saved, but not active until you apply them.` | Second line; `""` hides it |
| `applyLabel` | string | `Apply changes` | |
| `success` | string | `Changes applied` | Toast text when the response has no `meta.message` |
| `match` | string \| string[] | — | Only `fs:pending` events whose `path` contains one of these show the bar at once |
| `position` | `top` \| `bottom` | `top` | Sticks under the top bar, or to the bottom of the viewport |
| `label` | string | `Pending changes` | Accessible name of the region |

## Builder (PHP, P4)

```php
$ui->applyBar(gettext('Firewall changes are pending'))
   ->source('/v1/firewall/pending')->apply('/v1/firewall/apply')
   ->discard('/v1/firewall/pending', 'DELETE')->match('/v1/firewall/');
```

## Behaviour

- Polls `source` every `every` seconds (pauses with `FS.live`).
- On `$(document).trigger('fs:pending', [{ path }])`, which confirm, danger-confirm, modal-form and drawer actions trigger when a response carries `meta.pending`, it shows at once and re-checks the server.
- Apply: busy button, then hides, toasts `meta.message`, triggers `fs:applied`. A failure shows an error toast titled "Apply failed" and the bar stays.
- Discard: asks with `confirm({danger})` unless `confirm: false`, then hides, toasts and triggers `fs:discarded`.

## Instance API

`FS.el.get(node)`: `apply()`, `discard()`, `reload()`, `set(n | true | false)` (show/hide without the server), `pending` (count; −1 = some).

## Events

On the document: listens to `fs:pending`; triggers `fs:applied [{ path, response }]` and `fs:discarded [{ path, response }]`.

## Accessibility

- A labelled `region`; a polite live region announces the text when the bar appears (not on every poll).
- Status is icon + text, never colour only. Buttons are 40 px on touch screens; on narrow containers the actions wrap under the text.
