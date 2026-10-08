# callout

An inline message inside a page or form: a note, a warning before a risky
setting, a danger notice, a success confirmation. Icon, optional title, text,
an optional action link and an optional dismiss button.

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `level` | `info` \| `warn` \| `danger` \| `success` (aliases `ok`, `crit`, `warning`, `error`, `tip`) | `info` | Icon and tint |
| `title` | string | — | Bold first line |
| `text` | string | — | Body text |
| `icon` | Font Awesome name | per level | Override |
| `action` | `{ label, href, nav, event }` | — | Link with arrow (`href`, partial navigation unless `nav: false`), or a button that triggers the jQuery event `event` on the node |
| `dismissible` | bool | `false` | Shows a dismiss button |
| `id` | string | — | With `dismissible`: the dismissal is remembered in `localStorage` (`fs-callout-dismissed:<id>`) |
| `compact` | bool | `false` | Smaller padding and text |
| `announce` | bool | `false` | `role="alert"` (warn/danger) or `status` for callouts inserted after page load |

## Builder (PHP, P4)

```php
$ui->callout('warn', gettext('Gateway WAN2_DHCP is down'))
   ->text(gettext('Gateway group FAILOVER is running on one link.'))
   ->action(gettext('Open gateways'), '/network/gateways')->dismissible('gw-down-hint');
```

## For other elements

`import { calloutNode } from '../callout/callout.js'` builds the same markup.

## Instance API

`FS.el.get(node)`: `dismiss()`, `show()` (forgets the dismissal), `set(config)`.

## Events

`fs:dismissed [id]` on the node; the action's custom `event` when configured.

## Accessibility

- Title and text are real text, preceded by a visually hidden level word ("Warning:"), so the level is never colour-only.
- Static callouts have no live role (they would be read on every page load); use `announce` for messages added later.
- The dismiss button is labelled; after dismissing, focus moves to the next control. Storage failures are ignored (the callout then shows again next time).
