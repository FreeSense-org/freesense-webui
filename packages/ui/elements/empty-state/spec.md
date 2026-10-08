# empty-state

A standalone empty state for a page or section that has nothing yet ("No
aliases yet", "No VPN tunnels"), with one primary action. It renders through
`FS.states.empty`, so it looks exactly like the empty state data elements
show.

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `icon` | Font Awesome name | `inbox` | Icon in the circle |
| `title` | string | `Nothing here yet` | |
| `text` | string | — | One or two sentences: what this is and how to start |
| `action` | `{ label, icon, href, event }` | — | Primary button: a link (`href`, partial navigation) or a button that triggers the jQuery event `event` on the node |
| `secondary` | `{ label, href, nav }` | — | A quiet link under the button ("Learn more") |
| `size` | `sm` \| `md` \| `lg` | `md` | `lg` for whole pages (accent icon), `sm` inside cards and drawers |

## Builder (PHP, P4)

```php
$ui->emptyState('tags', gettext('No aliases yet'))
   ->text(gettext('Aliases group hosts, networks or ports so rules stay short.'))
   ->action(gettext('Add alias'), event: 'fs:add', icon: 'plus');
```

## Instance API

`FS.el.get(node).set(config)` re-renders.

## Events

The configured `action.event` on the node, with the config as argument.

## Accessibility

Title and text are real text; the icon is decorative. The action is a real link or button; the secondary link is 40 px high on touch screens.
