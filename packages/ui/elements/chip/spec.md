# chip

A small rounded label for filters: quick-filter toggles ("Pass 1,288",
"Block 310") and the active filter list ("Interface: WAN ×"). The toolbar and
log views own the filter state; chips report changes with events.

## Config

A single chip, or a group with `items`.

| Option | Type | Default | Meaning |
|---|---|---|---|
| `label` | string | — | Chip text; for a group the group's accessible name (default `Filters`) |
| `items` | Chip[] | — | Render a group (`role="group"`) |
| `clearAll` | bool | `false` | Group: "Clear all" link after removable chips |

**Chip:**

| Option | Type | Default | Meaning |
|---|---|---|---|
| `label` | string | — | Text |
| `name` | string | — | Prefix such as `Interface:` (muted) |
| `value` | string | `label` | Reported in events, kept in `data-value` |
| `icon` | Font Awesome name | — | Leading icon |
| `count` | number | — | Small count pill |
| `toggle` | bool | `false` | The chip is a button with `aria-pressed` |
| `pressed` | bool | `false` | Initial pressed state |
| `disabled` | bool | `false` | Toggle cannot be changed |
| `removable` | bool | `false` | × button |

## Builder (PHP, P4)

```php
$ui->chips(gettext('Action'))->toggle('pass', gettext('Pass'), pressed: true)->toggle('block', gettext('Block'));
$ui->chips(gettext('Active filters'))->clearAll()->removable('iface:wan', 'WAN', name: gettext('Interface'));
```

## For other elements

`import { chipNode } from '../chip/chip.js'` builds one chip.

## Instance API

`FS.el.get(node)`: `set(config)`, `pressed()` → values of pressed toggles.

## Events (bubble from the chip)

- `fs:chip-toggle [{ value, pressed }]`
- `fs:chip-remove [{ value }]`: the chip removes itself unless a handler calls `preventDefault()`.
- `fs:chips-clear` on the group: removes all removable chips unless prevented.

## Accessibility

- Toggles are real buttons with `aria-pressed`; the pressed state also changes weight and tint, not colour only.
- The remove button is labelled "Remove Interface: WAN". After removal focus moves to the next chip, else the previous one, else the group.
- Chips and remove buttons are 40 px high on touch screens.
