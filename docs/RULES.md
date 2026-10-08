# Rules

These rules keep every page looking and behaving the same, whatever theme is
active and whoever wrote the page. CI enforces every rule marked **[CI]**.
A rule changes only through a pull request that edits this file.

## R1. Pages are composed only of catalogue elements

- A page spec (`app/pages/**`) builds its UI through the `Ui` builder. **[CI]**
- No HTML strings, `echo`/`print` of markup, `style=` attributes, `<style>` or `<script>` tags. **[CI]**
- If a page needs something the catalogue lacks, the element is added to `@freesense/ui` first: spec, fixtures, gallery entry and tests. Then the page uses it. Elements are never created inside a page.

## R2. All data goes through the API

- Pages never read `config.xml`, run shell commands or call backend `.inc` functions. They declare API sources. **[CI]**
- Reads use `GET /api/v1/...`. Writes use `POST`, `PUT`, `PATCH` or `DELETE` with the `X-CSRF-Token` header.
- Polling goes through `FS.live` (scheduler) and `FS.batch` (one request per tick). No `setInterval` in element or page code. **[CI]**
- Every element that loads data has loading (skeleton), empty, error and stale states.

## R3. Nothing blocks

- The server renders the shell, page header, tabs and element skeletons without waiting for data.
- No synchronous request, no `alert()`/`confirm()`/`prompt()`. **[CI]** Use the confirm element.
- Long work (updates, package installs, captures, backups) runs as a job. The page shows the job element and survives reloads.

## R4. Tokens, not values

- SCSS outside `packages/ui/tokens/` uses tokens only: no hex colours, no raw `px` spacing or radius, no font stacks. **[CI]** (stylelint)
- Themes change tokens and documented skin maps. They never target element internals with their own selectors. **[CI]**

## R5. Light and dark, always

- Every theme defines both modes completely. **[CI]**
- Text contrast is at least 4.5:1, and UI component contrast at least 3:1, in both modes and with every accent the theme offers. **[CI]**
- Switching mode or theme never reloads the page.

## R6. Accessibility is part of done

- Everything is reachable and usable with the keyboard, and focus is always visible.
- Icon-only buttons have an accessible name.
- Colour is never the only signal: status is always shown as icon or marker plus text.
- Touch targets are at least 40 px. No horizontal page scroll at 375 px.
- `prefers-reduced-motion` turns off non-essential motion.
- The gallery runs axe on every element in every theme and mode. **[CI]**

## R7. One shell

- The top bar and the section menu belong to the engine. A page declares only `LAYOUT = 'full'` or `LAYOUT = 'section'` and its area.
- Pages never add navigation of their own beyond tabs and the view switch.

## R8. Icons

- Font Awesome 7 Solid only, canonical names only. No emoji as icons. **[CI]**

## R9. Versioning is a contract

- `@freesense/ui` follows semver. Adding an element or an option is a minor release; removing or changing one is a major release.
- Themes declare `"ui": "^2.0"`. Pages and package plugins declare the minimum version they need.
- Every element change updates its spec and fixtures, and gets a changelog entry.

## R10. No legacy

- Nothing in this repository includes, requires, links to or copies code from the 1.x WebUI: `head.inc`, `foot.inc`, `guiconfig.inc` UI parts, `classes/Form*`, `includes/fs_*.inc`, old `js/`, `css/` or `vendor/`. **[CI]**
- Old pages are read as a specification only (see PORTING.md).

## R11. Security

- Themes ship no PHP and no JS. The theme loader rejects anything except the manifest, CSS, fonts and images. **[CI]**
- Every value rendered by PHP is escaped by the builder. Elements set text with `textContent`/`.text()`, never by concatenating HTML.
- Requests that change state require the CSRF header. Privilege checks are done by the API, and the menu only hides what the API would refuse anyway.

## R12. Translations

- Every visible string goes through gettext (PHP) or `FS.i18n` (JS). There is no hard-coded English in elements.
