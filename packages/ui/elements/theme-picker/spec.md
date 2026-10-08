# theme-picker

Profile › Appearance. Every account has its own appearance: theme, mode
(light / dark / auto), accent and density.

- **Theme:** a card per installed theme (`/ui/manifest.json` → `themes`, then `/themes/<name>/theme.json`) with a mini-preview in light and dark side by side (page colour from `preview`, the accent on top), title, description, theme scheme, version and author. A theme for a scheme this engine does not accept is shown disabled with the reason.
- **Mode:** Light, Dark, Auto (follows the device).
- **Accent:** the selected theme's accents, with names.
- **Density:** Comfortable, Compact.

Every choice applies at once through `FS.theme.set` (no reload) and is saved
with `PUT /v1/me/preferences`. A short "Saved" note confirms it; a failed save
restores the previous appearance and explains why. Choosing a theme that lacks
the current accent switches to that theme's default accent.

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `manifest` | URL | `/ui/manifest.json` | Engine manifest listing the installed themes |
| `title` | string | "Appearance" | Card title |
| `description` | string | "Changes apply right away…" | Text under the title (empty hides it) |

Current values come from `<html data-fs-*>` (`FS.theme.get()`), which the
server renders from the user's preferences.

## Builder (PHP, P4)

```php
$ui->themePicker();
```

## Instance API

None beyond `destroy()`.

## Events

Listens to `fs:theme`, so changes from the profile menu or the command palette show here at once.

## States

Skeleton while the manifest and theme metadata load; empty when no theme is
listed. An unreadable manifest falls back to the current theme; an unreadable
`theme.json` shows that card disabled with the reason.

## Accessibility

- Each group (Theme, Mode, Accent, Density) is a labelled `radiogroup`; options are `role="radio"` buttons with `aria-checked`. Arrow keys, Home and End move and select; only the checked option is in the tab order.
- The chosen theme shows a check icon with hidden "In use" text; accents have names, so nothing depends on colour alone.
- Previews are `aria-hidden`; the card's accessible name is the theme title.
- The "Saved" note is a polite status.
