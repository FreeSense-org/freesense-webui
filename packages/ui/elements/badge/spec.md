# badge

A small static label: a type (`urltable`), a tag (`IPv6`), a count
(`Entries 92,112`), a version or channel. The text always carries the
meaning; the tone only supports it. For a state with an icon (online, down)
use `status`.

## Config

A single badge, or `items: [badge, …]` for a wrapped row.

| Option | Type | Default | Meaning |
|---|---|---|---|
| `label` | string | — | Text |
| `tone` | `neutral` \| `accent` \| `ok` \| `warn` \| `crit` \| `info` | `neutral` | Colour |
| `variant` | `soft` \| `solid` \| `outline` | `soft` | Tinted, filled or bordered (solid `warn` stays a strong tint for contrast) |
| `icon` | Font Awesome name | — | Leading icon |
| `count` | number \| string | — | Number after the label (tabular, thousands separated) |
| `mono` | bool | `false` | Monospace text (versions, identifiers) |
| `title` | string | — | Tooltip (use it for a count without a label) |

## Builder (PHP, P4)

```php
$ui->badge('urltable')->variant('outline')->mono();
$ui->badges([['label' => gettext('Entries'), 'count' => 92112, 'icon' => 'list']]);
```

## For other elements

`import { badgeNode } from '../badge/badge.js'` builds the same markup inside tables, headers and chips.

## Instance API

`FS.el.get(node).set(config)` re-renders.

## Accessibility

Real text, icons are `aria-hidden`. Long labels truncate with an ellipsis inside their container; give such badges a `title`.
