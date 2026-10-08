# status

An icon plus text for a state: service up/down, gateway health, rule actions.
Colour is never the only signal (RULES R6); the icon and the label always show.

This is the **reference element**. Copy its structure for new elements (see
`docs/ELEMENT-GUIDE.md`).

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `state` | `ok` \| `warn` \| `crit` \| `info` \| `neutral` \| `pending` \| `pass` \| `block` \| `reject` \| `match` | `neutral` | What the status means |
| `label` | string | per state (`OK`, `Warning`, …) | Visible text |
| `detail` | string | — | Secondary text after a dot, e.g. `12 ms` |
| `variant` | `plain` \| `pill` \| `dot` | `plain` | `pill` for tables and headers, `dot` for dense lists |

## Builder (PHP, P4)

```php
$ui->status('ok', gettext('Online'))->detail('12 ms')->variant('pill');
```

## Instance API

`FS.el.get(node).set({ state, label, detail })` updates in place.

## For other elements

`import { statusNode } from '../status/status.js'` builds the same markup inside tables, lists and widgets.

## Accessibility

The label is real text. The icon is `aria-hidden`. `pending` spins only without `prefers-reduced-motion`.
