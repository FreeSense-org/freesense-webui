# Writing an element

Every element in `@freesense/ui` follows this guide, so the library looks and
behaves like one product. The reference element is
`packages/ui/elements/status/`: copy its structure.

## 1. Files

```
packages/ui/elements/<name>/
  <name>.js         behaviour: FS.el.define('<name>', …)
  _<name>.scss      styles (layer `elements`), tokens only
  spec.md           purpose, config table, builder call, instance API, events, accessibility
  fixtures.json     gallery states (see 6)
```

The build discovers the folder automatically, so never edit a shared index file.
Mock API routes an element needs go into `gallery/mock/routes-<group>.js`
(`FSMock.route`, `FSMock.ok`, `FSMock.err`). Never edit `gallery/mock/core.js`.

Every file starts with the FreeSense header (RULES R13). Run `npm run check`.

## 2. Rendering model

- **The server emits only a container:** `<div data-fs-el="<name>" data-fs-config='{…}'></div>`, plus a skeleton for data elements. The PHP builder (`$ui-><name>(…)`, P4) maps 1:1 to the config documented in `spec.md`.
- **The element's JS renders everything from that config.** There is one rendering path, in the browser.
- **`init(node, config, ctx)` builds the DOM** with jQuery and `.text()`/`.attr()`. Never build HTML strings from data (RULES R11).
- **Return an instance API** (`update`, `reload`, `set`, …) when other code needs to drive the element. `FS.el.get(node)` returns it.
- **Clean up in `destroy()`:** document handlers (use a namespace), observers and charts. Live tasks registered through `ctx.live` stop automatically when the node is removed.

```js
import $ from 'jquery';
import { el } from '../../js/el.js';
import { batch } from '../../js/batch.js';
import { states } from '../../js/states.js';

el.define('kv-list', {
	init(node, config, ctx) {
		const $box = $(node).addClass('fs-kv');
		states.load(ctx, $box, () => batch.get(config.source.path, config.source.query).then((r) => r.data),
			(data) => { /* render; return false when empty */ }, { every: config.every || 0 });
		return { reload() { /* … */ } };
	}
});
```

## 3. Data

- `source: { path: '/v1/…', query: {…} }` and `every: <seconds>` (0 = once) are the standard config keys.
- Reads go through `FS.batch.get` (merged into one request per tick). Writes go through `FS.api.post/put/patch/del`.
- Polling goes only through `ctx.live` / `FS.states.load`. Never `setInterval` (RULES R2).
- Use `FS.states` for loading (skeleton), empty, error (with retry) and stale. Never invent another spinner or empty text.
- On a write: optimistic where safe (toggles), with a rollback and `toast` on error. For 422 responses, show `error.fields` next to the inputs.
- Formatting: `FS.fmt.bps/bytes/num/compact/pct/duration/ago/time`.

## 4. Look: calm, modern, FreeSense

The product should feel like a modern network console: airy, calm and precise.
Clean surfaces and hairline borders, not heavy chrome. It has the same kind of
vibe as current network-management apps, but its own identity (coral brand
accent, the FreeSense mark).

| Do | Don't |
|---|---|
| White/raised cards on a soft page background, 1 px `--fs-border-default` borders | Heavy shadows, gradients, glow |
| `--fs-radius-lg` for cards and panels, `--fs-radius-md`/`sm` for controls | Mixed radii in one element |
| Generous padding (`--fs-pad`), clear grouping, whitespace between groups | Dense walls of borders |
| Titles 600 weight, sentence case, `--fs-text-strong` | ALL-CAPS titles (small group labels may be uppercase at 11 px) |
| Secondary text `--fs-text-muted`, 13 px for meta | Grey-on-grey below contrast |
| Numbers in `font-variant-numeric: tabular-nums`, units smaller and muted | Units as large as the number |
| Accent only for primary actions, active states, focus and key data | Accent on everything |
| Status via the `status` element (icon + text) | Colour-only dots |
| Hover = a subtle `--fs-surface-sunken`/tint; pressed = a slightly stronger tint | Large colour jumps |
| Motion 120–200 ms (`--fs-dur-*`), transform/opacity only | Animating layout properties, long or bouncy motion |
| Icons: Font Awesome Solid, 14–16 px, muted unless meaningful | Emoji, mixed icon sets |

Respect the density tokens (`--fs-control-h`, `--fs-row-h`, `--fs-pad`, `--fs-gap`).
Compact density must still work.

## 5. Styles

- Everything in `@layer elements { … }`.
- **Root class `.fs-<name>`,** parts `.fs-<name>-<part>`, states as `.is-<state>` or `data-*`.
- **Tokens only:** `var(--fs-…)` for colour, radius, space, font, duration and shadow. No hex values, no raw px for spacing (rem is fine for layout sizes), no font stacks (RULES R4).
- **Tints** come from `color-mix(in srgb, var(--fs-…) N%, transparent)`.
- **Light and dark** come for free from tokens. Check both in the gallery.
- **Theme skins:** read `[data-fs-skin-cards|tables|buttons]` on `<html>` where the element is a card, table or button.
- **Phone width:** works at 375 px wide with no horizontal page scroll. Tables scroll inside their container or switch to cards.

## 6. Fixtures (`fixtures.json`)

```json
{
	"title": "Stat tile",
	"description": "Big number with label, trend and sparkline.",
	"status": "draft",
	"fixtures": [
		{ "name": "Live throughput", "width": "md", "config": { … } },
		{ "name": "Loading", "width": "md", "config": { "source": { "path": "/v1/gallery/slow" } } },
		{ "name": "Empty", "width": "md", "config": { "source": { "path": "/v1/gallery/empty" } } },
		{ "name": "Error", "width": "md", "config": { "source": { "path": "/v1/gallery/fail" } } }
	]
}
```

- `width`: `sm` | `md` | `lg` | `full` (gallery columns 3/4/6/12).
- `surface: "page"`: show it on the page background instead of a card, for elements that are cards themselves.
- Cover default, loading, empty, error and stale where they apply, plus long text, many items and compact density.
- `status`: `draft` until spec, fixtures and review are complete, then `stable`.

Mock data is available from the routes in `gallery/mock/` (system, interfaces,
traffic + history, gateways, services, DHCP leases, top talkers, VPN, states,
notices, firewall rules/aliases/pending/apply, firewall and system logs with
cursors, dashboard layout, me/preferences/sessions, version, jobs), plus the
`/v1/gallery/*` test routes.

## 7. Accessibility checklist

- [ ] Keyboard: every action is reachable and works with Enter/Space; Escape closes overlays; focus is visible and returns to the trigger.
- [ ] Icon-only buttons have `aria-label` (and `title`).
- [ ] Live values that change often use a polite live region only where the user needs announcements, never on every tick.
- [ ] Status is never colour-only.
- [ ] Touch targets are at least 40 px on phones.
- [ ] Animations stop under `prefers-reduced-motion` (the base layer does most of this).
- [ ] Text contrast comes from tokens; never lower opacity on text below the muted token.

## 8. Done

- `npm run build`, `npm test` and `npm run check` are green, and the fixtures render in `npm run gallery` → `/gallery/elements.html` in light and dark with no console errors.
- `spec.md` documents every config option, the builder call, the instance API, events and accessibility.
- Commit only inside your element folders (plus your `gallery/mock/routes-<group>.js`) and the rebuilt `dist/`.
