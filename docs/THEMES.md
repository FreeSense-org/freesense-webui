# Themes

A theme changes how FreeSense looks, never what it does. It is **data only**:
tokens, optional skin maps, fonts and a manifest. It ships no PHP and no JS (RULES R11).

## Anatomy

```
packages/theme-<name>/
  manifest.json
  tokens/
    light.json        complete token set for light mode
    dark.json         complete token set for dark mode
  skins/_skins.scss   optional: documented per-element skin maps
  fonts/              optional: woff2 files (vendored, never a CDN)
  preview.png         used by the theme picker
```

Built output: `dist/public/themes/<name>/{manifest.json, theme.css, fonts/, preview.png}`.

## manifest.json

```json
{
	"name": "freesense",
	"title": "FreeSense",
	"version": "2.0.0",
	"ui": "^2.0",
	"modes": ["light", "dark"],
	"defaultMode": "auto",
	"accents": [
		{ "id": "coral", "title": "Coral", "default": true },
		{ "id": "blue",  "title": "Blue" },
		{ "id": "teal",  "title": "Teal" },
		{ "id": "violet", "title": "Violet" }
	],
	"densities": ["comfortable", "compact"],
	"fonts": ["Inter", "JetBrains Mono"],
	"author": "The FreeSense Project",
	"license": "Apache-2.0"
}
```

Both `modes` are required. Every accent must have values in both modes' token
files. The build rejects a manifest that breaks either rule.

## Tokens

Tokens are the only things a theme sets. The full list and its meaning lives in
`packages/ui/tokens/schema.json`. The groups:

| Group | Examples |
|---|---|
| Surface | `surface.page`, `surface.raised`, `surface.sunken`, `surface.overlay`, `surface.glass` |
| Text | `text.strong`, `text.default`, `text.muted`, `text.on-accent` |
| Border | `border.default`, `border.strong`, `border.focus` |
| Accent | `accent.<id>.fill`, `accent.<id>.text`, `accent.<id>.tint` (one set per accent) |
| Status | `status.ok`, `status.warn`, `status.crit`, `status.info`, `status.neutral` + tints |
| Firewall | `action.pass`, `action.block`, `action.reject`, `action.match` |
| Chart | `series.1` … `series.8`, `series.other`, `chart.grid`, `chart.text` |
| Type | `font.ui`, `font.mono`, `size.xs` … `size.display`, weights, line heights |
| Space / size | `space.1` … `space.8`, `control.h`, `row.h`, `hit` (per density) |
| Shape | `radius.sm/md/lg/pill`, `border.width` |
| Elevation | `shadow.1` … `shadow.3`, `blur.glass` |
| Motion | `duration.fast/base/slow`, `ease.standard/enter/exit` |

Densities override only the size and space tokens.

## Checks (CI, and again at install on the firewall)

- Both modes define every token in the schema.
- Contrast is at least 4.5:1 for text on every surface and accent, and at least 3:1 for UI components and focus rings, in both modes and with every accent.
- Only manifest, CSS, woff2, png, webp and svg (sanitised) files.
- `ui` range matches the installed engine. Otherwise the user falls back to `freesense` with a notice.

## Per-user appearance

Each user picks a theme, mode (light / dark / auto), accent and density in
**Profile › Appearance**. The theme picker shows a live preview. Changes apply
instantly without a reload and are saved through `PUT /api/v1/me/preferences`.
Administrators set defaults for new users under **System › General › Appearance**.

## Distribution

- **Core theme:** `@freesense/theme-freesense`, built into `dist/`.
- **More themes:** each is built with `npm create @freesense/theme`, published to npm if wanted, and shipped to firewalls as a FreeSense package `FreeSense-theme-<name>`. The package installs the built folder to `/usr/local/www-ui/themes/<name>/`; only that package rebuilds when it changes.
