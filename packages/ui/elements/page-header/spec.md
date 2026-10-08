# page-header

The top of every page: breadcrumb (area / feature), title, subtitle, status
chips, one primary action, secondary actions and a help link. The server
renders it without waiting for data (RULES R3).

On phones (< 576 px) the primary action fills the row and the secondary
actions and help move into one "More actions" menu.

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `breadcrumb` | `[{label, href}]` | `[]` | Area / feature / page; the last item is the current location (no link) |
| `title` | string | — | The page title (`h1`; FS.nav focuses it after partial navigation) |
| `subtitle` | string | — | One muted sentence under the title |
| `chips` | `[{state, label, detail}]` | `[]` | Status pills next to the title (`status` element states) |
| `primary` | Action | — | The one primary action |
| `actions` | Action[] | `[]` | Secondary actions (buttons or links) |
| `help` | `{href, label, external}` | — | Help link (icon button); opens in a new tab unless `external: false` |

Action: `{ id, label, icon, href, external, variant, danger, iconOnly, disabled, title }`
(see `card/spec.md`). Links navigate through `data-fs-nav`; buttons emit `fs:action`.

## Builder (PHP, P4)

```php
$ui->pageHeader(gettext('Peers'))
   ->breadcrumb([[gettext('VPN'), '/vpn'], [gettext('WireGuard'), '/vpn/wireguard'], [gettext('Peers')]])
   ->subtitle(gettext('Remote devices and sites that connect to your WireGuard tunnels.'))
   ->chip('ok', gettext('Service running'))
   ->primary('add', gettext('Add peer'), 'plus')
   ->action('import', gettext('Import'), 'file-import')
   ->help('https://docs.freesense.org/vpn/wireguard/peers');
```

Page patterns (`ResourcePage`, …) fill this from the page's area, feature and title.

## Instance API

| Method | Effect |
|---|---|
| `setTitle(text)` | Change the title |
| `setSubtitle(text)` | Change or clear the subtitle |
| `setChips(chips)` | Replace the status chips |
| `setDisabled(id, bool)` | Enable/disable an action everywhere it appears (bar and phone menu) |

## Events

`fs:action` with `{id, el: 'page-header'}` (jQuery event on the node, bubbles).

## Accessibility

- The breadcrumb is a `nav` labelled "Breadcrumb"; the current item has `aria-current="location"`.
- The title is the page's only `h1`.
- Chips are `status` pills: icon + text, never colour only.
- The help button and the phone menu toggle have `aria-label`; the menu supports arrow keys and Escape.
- Disabled links get `aria-disabled` and leave the tab order.
