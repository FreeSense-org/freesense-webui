# Themes

A theme changes how FreeSense looks, never what it does. A theme is **one JSON
file**: `<name>.theme.json`. It holds the identity, both colour modes, accents,
shape, densities, fonts and a few fixed skin choices. It contains no CSS, no PHP
and no JS (RULES R11).

The format is defined by a published, versioned JSON Schema, the **theme scheme**:

```
schema/theme-2.0.schema.json
https://raw.githubusercontent.com/FreeSense-org/freesense-webui/main/schema/theme-2.0.schema.json
```

Point `$schema` at the scheme you write for, and any editor that supports JSON
Schema (VS Code and others) gives you autocomplete and validation while you write
a theme.

## Scheme versions

A theme declares the scheme it was written for, e.g. `"scheme": "2.0"`. This is
separate from the theme's own `version`. The system supports one scheme version
(`packages/ui/package.json` → `freesense.themeScheme`) and decides as follows:

| Theme scheme | System supports 2.0 | System supports 2.1 |
|---|---|---|
| 2.0 | installs | installs (fields added in 2.1 get their defaults) |
| 2.1 | **refused**: "This theme needs theme scheme 2.1; this system supports 2.0. Update FreeSense first." | installs |
| 3.0 | **refused** (different major) | **refused** (different major) |

Rules for changing the scheme:
- A **minor** scheme (2.1, 2.2 …) may only **add optional** fields. Every new field has a default, so older themes keep working.
- Removing, renaming or tightening a field needs a **new major** (3.0).
- A released scheme file is **frozen**. A change means a new file (`theme-2.1.schema.json`), and CI rejects edits to released scheme files.
- An installed theme whose scheme becomes unsupported after an update (only possible across a major) stops being offered. Its users fall back to `freesense` with a notice.

## Making a theme

```json
{
	"$schema": "https://raw.githubusercontent.com/FreeSense-org/freesense-webui/main/schema/theme-2.0.schema.json",
	"scheme": "2.0",
	"name": "midnight",
	"title": "Midnight",
	"version": "1.0.0",
	"defaultMode": "dark",
	"defaultAccent": "cyan",
	"accents": {
		"cyan": {
			"title": "Cyan",
			"light": { "fill": "#0e7490", "text": "#0e7490", "on": "#ffffff" },
			"dark":  { "fill": "#22d3ee", "text": "#67e8f9", "on": "#06202a" }
		}
	},
	"modes": {
		"light": { "surface": { … }, "text": { … }, "border": { … }, "status": { … }, "action": { … }, "series": { … }, "chart": { … }, "shadow": { … } },
		"dark":  { … }
	},
	"shape": { "radiusSm": "6px", "radiusMd": "10px", "radiusLg": "16px" },
	"skin": { "topbar": "inverse", "sectionMenu": "sunken", "cards": "outlined", "tables": "lines", "buttons": "rounded" }
}
```

Start from `packages/theme-freesense/freesense.theme.json`, or run
`npm create @freesense/theme` once the kit is published.

### What a theme can set

| Part | Contents |
|---|---|
| `modes.light` / `modes.dark` (both required) | `surface` (page, raised, sunken, overlay, topbar, section), `text` (strong, default, muted, topbar), `border` (default, strong, focus), `status` (ok, warn, crit, info, neutral), `action` (pass, block, reject, match), `series` (8 colours + other), `chart` (grid, text), `shadow` (sm, md, lg) |
| `accents` | 1–12 accents, each with `fill`, `text` and `on` for both modes. Users pick one |
| `shape` | Radii, border width, focus width |
| `densities` | Optional overrides for `comfortable` / `compact` sizes |
| `fonts` | `ui` and `mono` families: bundled ones, or woff2 files shipped with the theme |
| `motion` | Durations |
| `skin` | Fixed choices for top bar, section menu, cards, tables and buttons. No free CSS |

Values are restricted to safe forms: hex colours, `px`/`rem` lengths, `ms`
durations and simple shadows. That keeps themes safe to install from anyone.

## How a theme becomes CSS

The engine CSS (`dist/public/ui/fs-ui.css`) styles every element with CSS custom
properties (`--fs-*`). A theme only supplies the values:

```
midnight.theme.json  ──►  themes/midnight/theme.css
                          :root[data-fs-theme=midnight][data-bs-theme=light] { --fs-surface-page: … }
                          :root[data-fs-theme=midnight][data-bs-theme=dark]  { … }
                          :root[data-fs-theme=midnight][data-fs-accent=cyan] …
```

The conversion is plain data mapping, done in two places with the same rules:
- **at build time** (`tools/theme/compile.mjs`) for themes in this repository and theme packages;
- **on the firewall** (PHP, in the WebUI app) for themes imported through **System › Appearance › Import theme**. No Node is needed on the firewall.

Because every element is built from these properties, a theme can never "miss"
an element, and new elements in later 2.x releases pick up existing themes automatically.

## Checks

The same checks run in CI, on theme import and when a theme package installs:
1. `scheme` is supported by this system (see Scheme versions), and the file validates against that scheme's schema file.
2. Contrast in **both modes and with every accent**:
   - at least 4.5:1 for text: `text.*` on `surface.page` and `surface.raised`, `accent.text` on surfaces, `accent.on` on `accent.fill`, `text.topbar` on `surface.topbar`;
   - at least 3:1 for `border.strong`, `border.focus` and status/action colours used as marks.

A theme that fails is rejected, with the failing pairs listed.

## Per-user appearance

Each user picks a theme, mode (light / dark / auto), accent and density in
**Profile › Appearance**. A live preview shows the choice before saving. Changes
apply instantly without a reload and are stored with `PUT /api/v1/me/preferences`.
Administrators set defaults for new users and can install or import themes under
**System › Appearance**.

## Distribution

| Way | For | How |
|---|---|---|
| Core | `freesense` theme | `packages/theme-freesense`, compiled into `dist/` |
| Import | Anyone | Upload a `.theme.json` in System › Appearance; validated and converted on the firewall |
| Package | Curated themes | `FreeSense-theme-<name>` in freesense-packages installs the compiled folder to `/usr/local/www-ui/themes/<name>/` |
| npm | Theme authors | `@freesense/theme-kit` (scheme files, compiler, contrast checker, preview gallery) and `npm create @freesense/theme` |
