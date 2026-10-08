# tabs

In-page tabs between parts of one page (interface Overview / Counters / DHCP).
Navigation between pages of a feature is the shell's card menu, not tabs.
Tabs that do not fit move into a "More" menu; the active tab always stays
visible. Each tab's content renders the first time the tab is shown.

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `tabs` | Tab[] | `[]` | `{id, label, icon, badge, disabled, content}` |
| `active` | string | first enabled tab | Initially active tab |
| `query` | bool \| string | `false` | Sync with the URL: `true` = `?tab=<id>`, a string = that parameter name |
| `label` | string | "Sections" | Accessible name of the tab list |

`content` takes the same shapes as `card` content (see `card/spec.md`), so a
tab can hold a kv-list, a grid of cards, a form, …. A `?tab=` value in the URL
wins over `active`. URL changes use `history.replaceState` (no new history entry).

## Builder (PHP, P4)

```php
$ui->tabs()->query()
   ->tab('overview', gettext('Overview'), $ui->kvList()->source('/status/interfaces/wan'), 'circle-info')
   ->tab('counters', gettext('Counters'), $ui->kvList()->source('/status/interfaces/wan'))
   ->tab('dhcp', gettext('DHCP lease'), gettext('…'))->badge(1);
```

## Instance API

| Method | Effect |
|---|---|
| `show(id)` | Activate a tab |
| `active()` | The active tab id |
| `setBadge(id, n)` | Set or clear (`null`) a count badge |
| `panel(id)` | The tab's panel (jQuery) |

## Events

`fs:tab` with `{id, el: 'tabs'}` when the active tab changes (not on init).

## Accessibility

- WAI-ARIA tabs: `tablist`, `tab` (`aria-selected`, `aria-controls`, roving `tabindex`), `tabpanel` (`aria-labelledby`, focusable).
- Left/Right move between visible tabs and activate them; Home/End jump to the ends.
- Overflowed tabs are reached through the "More" menu (arrow keys, Escape); choosing one moves it into the bar and focuses it.
- Badges are text; touch targets are 44 px on coarse pointers.
