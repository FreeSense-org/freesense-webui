# command-palette

A search dialog for pages, settings and quick actions. It opens with
**Ctrl+K** (⌘K on macOS), **/** (when not typing in a field), the top-bar
search button, or any element with `data-fs-palette`.

- **Pages** come from the navigation model (`#fs-nav`: areas → groups → items → pages), so the palette offers exactly what the menus offer for this user.
- **Quick actions:** switch light/dark, apply pending changes, sign out.
- **Matching** is fuzzy: whole words and word starts rank first, then substrings, then letters in order (`fw rul`, `wgpe` → WireGuard › Peers). Matched letters are highlighted. Every query word must match the title or the breadcrumb.
- **Recent items** (last 5 used) show when the query is empty; they live in `localStorage` (`fs-palette-recent`), and the palette works without it.
- Pages open through `FS.nav.go` (partial navigation); outside the shell, by a normal page load.

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `trigger` | `search` \| `icon` \| `none` | `search` | Top-bar search field look, icon-only button, or no trigger |
| `hotkeys` | bool | `true` | Ctrl+K and `/`. Only the first palette on a page takes them |
| `nav` | object | — | Navigation model; default: parse `#fs-nav` (`navSource` selector) each time it opens |
| `actions` | `false` \| array | `['mode','apply','signout']` | Which quick actions to offer |
| `apply.path` | API path | `/v1/firewall/apply` | `POST` for "Apply pending changes" |
| `signOut` | object | `{}` | Passed to profile-menu's `signOut()` (`path`, `redirect`) |
| `recent` | number | `5` | Recent items shown |
| `limit` | number | `12` | Results shown for a query |
| `placeholder` | string | "Search pages, settings and actions…" | Input placeholder |
| `inline` | bool | `false` | Render the panel in place, not as a dialog (gallery, help pages) |
| `query` | string | `''` | Initial query (inline fixtures) |

## Builder (PHP, P4)

```php
$ui->commandPalette()->trigger('search')->applyPath('/v1/firewall/apply');
```

The Shell renders it in the top-bar tools.

## Instance API

`open(query?)`, `close()`, `setModel(model)`.

Exported helpers for tests and other search UIs: `indexModel(model)`, `fuzzy(text, token)`, `matchEntry(entry, query)`.

## Events

Listens to `fs:theme` to keep the mode action's wording right.

## Accessibility

- A native modal `<dialog>`: focus is trapped, Escape closes it, and focus returns to where it was. Clicking the backdrop closes it.
- The input is a `combobox` with `aria-controls` and `aria-activedescendant`; results are a `listbox` of `option`s with `aria-selected`. Group headings are presentational.
- ↑/↓ move, Enter opens, Ctrl+Home/End jump. A polite status announces the number of results.
- Highlighting uses `<mark>` built from text nodes (no HTML from data).
- On phones the dialog sits near the top and the shortcut legend hides.
