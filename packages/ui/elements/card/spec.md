# card

A titled surface: optional icon, title, subtitle, status pill, header actions
and menu, a body with nested content, and a footer. Optionally collapsible.
Follows the theme's card skin.

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `title` | string | — | Card title (h2, or h3 with `level: 3`) |
| `level` | `2` \| `3` | `2` | Heading level of the title |
| `icon` | string | — | Font Awesome Solid name, shown in a soft tile |
| `subtitle` | string | — | Muted line under the title |
| `status` | `{state, label, detail}` | — | Status pill in the header (see `status`) |
| `actions` | Action[] | `[]` | Header buttons; icon-only (ghost, small) when they have an `icon` |
| `menu` | Action[] | `[]` | "Card actions" menu (ellipsis); items may be `{divider: true}` |
| `content` | Content | — | Body content, see **Nested content** |
| `footer` | string \| `{text, actions, primary, link}` | — | Footer text, buttons (`primary: true` makes the first one primary) and a right-aligned link |
| `collapsible` | bool | `false` | The title becomes a toggle button |
| `collapsed` | bool | `false` | Start collapsed (with `collapsible`) |
| `flush` | bool | `false` | Body without padding (for a data-table inside) |

**Action** (shared by page-header, card, section, toolbar):
`{ id, label, icon, href, external, variant, danger, iconOnly, disabled, title }`.
With `href` it is a link (partial navigation through `data-fs-nav`, or a new tab
with `external`); without it, a button that emits `fs:action`.

## Nested content

Elements render from config, so a container cannot take server-rendered
children. `content` describes them instead, and the card renders child nodes
(`<div data-fs-el data-fs-config>`) that FS.el initialises like any element.
The helper lives in `card/nest.js` and is shared by `section`, `grid`,
`split-view`, `tabs` and `toolbar`; later containers should import it too.

| `content` | Renders |
|---|---|
| `"text"` / `["p1", "p2"]` | Paragraphs |
| `{type: 'text', text, muted}` | Paragraphs, optionally muted |
| `{type: 'kv', …kv-list config}` | A nested `kv-list` |
| `{el, config}` | One child element |
| `[{el, config}, …]` or `{type: 'elements', items: […]}` | Stacked child elements (gap `--fs-gap`) |

Children are started immediately (`startChildren`), so `FS.el.get()` works on
them as soon as the parent's `init` returns, also during the first page scan.

```js
import { renderContent, contentNodes, childNode, startChildren } from '../card/nest.js';
renderContent($box, config.content);           // replace + start
```

## Builder (PHP, P4)

```php
$ui->card(gettext('System'))->icon('server')->subtitle($hostname)
   ->action('refresh', gettext('Refresh'), 'rotate-right')
   ->menu([['id' => 'reboot', 'label' => gettext('Reboot'), 'icon' => 'power-off', 'danger' => true]])
   ->content($ui->kvList()->source('/status/system')->every(5)->field('uptime', gettext('Uptime'), 'duration'))
   ->footer(gettext('Updated every 5 seconds'));
```

## Instance API

| Method | Effect |
|---|---|
| `collapse(bool)` | Collapse or expand a collapsible card |
| `body()` | The body container (jQuery) |
| `setContent(content)` | Replace the body content |
| `setTitle(text)` | Change the title |
| `setFooter(footer)` | Replace the footer (`null` removes it) |

## Events

| Event | Detail |
|---|---|
| `fs:action` | `{id, el: 'card'}`, from header actions, menu items and footer buttons |
| `fs:toggle` | `{el: 'card', collapsed}` |

jQuery events on the card node; they bubble: `$(node).on('fs:action', (e, d) => …)`.

## Skin

`html[data-fs-skin-cards]`: `outlined` (default, hairline border), `raised`
(border + `--fs-shadow-sm`), `flat` (no border, no shadow).

## Accessibility

- A titled card is a `region` labelled by its title.
- Icon-only header buttons and the menu toggle have `aria-label` and `title`.
- The collapse toggle is a real button with `aria-expanded` and `aria-controls`.
- The menu is a Bootstrap dropdown: arrow keys move, Escape closes and returns focus.
