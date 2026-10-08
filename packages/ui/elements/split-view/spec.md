# split-view

A list and its detail side by side (WireGuard peers, certificates, users). From
992 px the list has a fixed width and the detail takes the rest; below that the
two stack (list first). With `resizable`, a divider can be dragged or moved with
the arrow keys.

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `list` | Content | — | List pane content (same shapes as `card` content) |
| `detail` | Content | — | Detail pane content |
| `listWidth` | number (rem) | `20` | List width on wide screens (min 12) |
| `resizable` | bool | `false` | Show a draggable divider |
| `listLabel` | string | "List" | Accessible name of the list region |
| `detailLabel` | string | "Details" | Accessible name of the detail region |

## Builder (PHP, P4)

```php
$ui->splitView()->resizable()->listWidth(18)
   ->list($ui->dataTable(...)->source('/vpn/wireguard/peers'))
   ->detail($ui->card(gettext('Peer'))->content($ui->kvList()->source('/vpn/wireguard/peers/office-gw')));
```

## Instance API

| Method | Effect |
|---|---|
| `setDetail(content)` | Replace the detail pane (e.g. when a list row is selected) |
| `setList(content)` | Replace the list pane |
| `width([rem])` | Get, or set and return, the list width (limited to 12 rem – 60 % of the view) |

## Events

`fs:resize` with `{el: 'split-view', width}` after a drag or key move.

## Accessibility

- Both panes are labelled `region`s.
- The divider is `role="separator"` with `aria-valuenow/min/max`, focusable;
  Left/Right move 1 rem (Shift: 4 rem), Home/End jump to the limits.
- Below 992 px the divider is hidden and the panes stack in reading order.
