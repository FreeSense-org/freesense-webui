# section

A titled group of content inside a page: title, description, actions and
nested elements, without card chrome. Use it to group cards, lists or forms
under one heading.

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `title` | string | — | Heading (h2, or h3 with `level: 3`) |
| `level` | `2` \| `3` | `2` | Heading level |
| `icon` | string | — | Muted icon before the title |
| `description` | string | — | Muted text under the title |
| `actions` | Action[] | `[]` | Small secondary buttons, right-aligned |
| `menu` | Action[] | `[]` | "Section actions" menu |
| `divider` | bool | `false` | Hairline above the section (separates it from the one before) |
| `content` | Content | — | Nested content, same shapes as `card` (see `card/spec.md`) |

## Builder (PHP, P4)

```php
$ui->section(gettext('Interface details'))
   ->description(gettext('Addresses and link state of the WAN interface.'))
   ->action('edit', gettext('Edit'), 'pen', '/network/interfaces/wan')
   ->content($ui->kvList()->items([...]));
```

## Instance API

| Method | Effect |
|---|---|
| `body()` | The content container (jQuery) |
| `setContent(content)` | Replace the nested content |

## Events

`fs:action` with `{id, el: 'section'}`.

## Accessibility

A titled section is a `region` labelled by its heading. Keep heading levels in
order (`h1` page header → `h2` section → `h3` card inside it).
