# view-switch

A segmented control for a small set of views of the same data: table or
cards, live or history range. It changes how data is shown, never which page
is open (RULES R7).

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `options` | `[{id, label, icon, iconOnly, disabled}]` | `[]` | Two to five views |
| `value` | string | first enabled | Selected view |
| `query` | bool \| string | `false` | Sync with the URL: `true` = `?view=<id>`, a string = that parameter |
| `label` | string | "View" | Accessible name of the group |
| `size` | `md` \| `sm` | `md` | `sm` for toolbars and card headers |
| `block` | bool | `false` | Full width, equal segments |

## Builder (PHP, P4)

```php
$ui->viewSwitch(gettext('Time range'))->query('range')->value('1h')
   ->option('live', gettext('Live'))->option('1h', gettext('1 h'))->option('24h', gettext('24 h'));
```

## Instance API

| Method | Effect |
|---|---|
| `set(id)` | Select a view (emits `fs:view` when it changes) |
| `value()` | The selected view id |

## Events

`fs:view` with `{id, el: 'view-switch'}` when the user (or `set`) changes the view.

## Accessibility

- `radiogroup` of `radio` buttons with `aria-checked` and a roving `tabindex`: Tab enters the group, arrow keys (and Home/End) select.
- Icon-only options have `aria-label` and `title`.
- Touch targets grow to 44 px on coarse pointers.
