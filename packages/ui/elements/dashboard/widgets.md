# Widget contract

Dashboard widgets are JS modules that register a **widget type** with
`FS.widgets.define()`. The core widgets (`widgets/*.js` in this folder) and
package plugins use the same contract. A widget composes catalogue elements
(stat-tile, meter, ring, sparkline, chart, status, kv-list, badge, chip,
callout, …); it never builds HTML from strings and never polls on its own.

```js
FS.widgets.define('wireguard-peers', {
	title: 'WireGuard peers',          // English source; translated with FS.i18n
	icon: 'shield-halved',             // Font Awesome Solid name
	category: 'VPN',                   // catalogue group (core: System, Network, Security, VPN, Services, Shortcuts, Custom)
	description: 'Peers with their last handshake and traffic.',
	sizes: ['md', 'lg', 'xl'],         // allowed: sm | md | lg | xl | full
	size: 'md',                        // default size
	every: 10,                         // default refresh in seconds (0 = load once)
	settings: [                        // modal-form fields; `value` is the default
		{ name: 'tunnel', type: 'select', label: 'Tunnel', value: 'all', options: (ctx) => ctx.get('/v1/vpn/wireguard/tunnels').then((l) => l.map((x) => ({ value: x.id, label: x.name }))) },
		{ name: 'limit', type: 'number', label: 'Rows to show', value: 6, min: 1, max: 30 }
	],
	mount(ctx) {                       // build the static DOM once (also after settings change)
		ctx.state.$list = $('<ul class="fs-wlist" role="list">').appendTo(ctx.$body);
	},
	load(ctx) {                        // fetch + render; called by the widget's FS.live task
		return ctx.get('/v1/vpn/wireguard/peers', { tunnel: ctx.settings.tunnel }).then((peers) => {
			if (!peers.length) return false;             // false → the empty state
			/* render into ctx.state.$list … */
		});
	},
	destroy(ctx) {}                    // optional: document handlers, observers
});
```

## Definition

| Key | Type | Default | Meaning |
|---|---|---|---|
| `title` | string | the type | Default title (users can set their own in Settings) |
| `icon` | string | `square` | Font Awesome Solid name (header tile and catalogue preview) |
| `category` | string | `Custom` | Catalogue group |
| `description` | string | — | One sentence in the catalogue (also searched) |
| `keywords` | string[] | — | Extra catalogue search words |
| `sizes` | string[] | `['md']` | Sizes offered in the menu |
| `size` | string | first of `sizes` | Size when added |
| `every` | seconds | `5` | Default refresh interval; users pick Off/2/5/10/30/60 per widget |
| `settings` | Field[] | `[]` | Settings fields (see below). A Title field is always added |
| `multiple` | bool | `true` | `false` allows one copy only (System, Notices) |
| `isNew` | bool | `false` | "New" badge in the catalogue |
| `hidden` | bool | `false` | Not listed in the catalogue (still renders from a saved layout) |
| `empty` | `{icon, title, text}` | "Nothing to show" | Empty state when `load` resolves `false` |
| `lines` | number | `3` | Skeleton lines while loading |
| `skeleton` | bool | `true` | `false` shows the mounted content at once (a widget whose child element has its own loading state, like a chart) |
| `restartOnEvery` | bool | `false` | Re-mount when the interval changes (for child elements that poll themselves) |
| `mount(ctx)` | function | — | Build the DOM. Runs when the widget first comes into view and after settings change |
| `load(ctx)` | function → Promise | — | Fetch and render. Resolve `false` for the empty state; reject for the error state |
| `resize(ctx)` | function | — | Optional, after the size changed |
| `destroy(ctx)` | function | — | Optional clean-up |

At least one of `mount` and `load` is required. The type name is lowercase
(`a-z0-9.-`); package widgets use their package prefix (`crowdsec.decisions`).

**Settings field:** the `FS.modalForm` field shape — `{ name, type: 'text' | 'number' | 'select' | 'switch' | 'textarea', label, value, help, required, placeholder, options, min, max, mono }`.
`options` may be an array or `(ctx) => Promise<array>` (resolved when the dialog opens).
Selects are required unless `required: false` (then `placeholder` is the empty choice).
Labels, help texts and option labels are English sources translated through `FS.i18n`.
The settings are saved with the layout; the API validates them (`PUT …/layout/widgets/{id}`, 422 with field errors).

## ctx

| Member | Meaning |
|---|---|
| `id`, `type`, `def` | Instance id, type, definition |
| `$root`, `$body` | The widget node and the content container to render into |
| `settings`, `size`, `every` | Current values (read-only; settings include the defaults) |
| `state` | Scratch object for the instance (cleared on re-mount) |
| `get(path, query)` | `FS.batch` GET, resolves to `data` (all widgets' reads in one tick share one request) |
| `fetch(path, query)` | `FS.batch` GET, resolves to `{data, meta}` |
| `api`, `fmt`, `t` | `FS.api` for writes, `FS.fmt`, `FS.i18n.t` |
| `child($parent, name, config)` | Create a catalogue element inside `$parent`; returns a handle to its instance API (`set`, `push`, `update`, …). The handle survives the element being re-initialised after the widget moves |
| `setSubtitle(text)` | Muted line under the title |
| `setFooter(text \| node \| null)` | Footer content (links such as "All services →") |
| `refresh()` | Run `load` now |
| `save(settings)` | Merge settings, save the layout and re-mount (for in-widget controls such as the Traffic interface chips) |
| `links`, `linkBase` | The dashboard's page link overrides (core widgets use `widgets/util.js` `link(ctx, key)`) |

## Rules

- **Data:** reads through `ctx.get`/`ctx.fetch` only, writes through `ctx.api` with a toast and `ctx.refresh()`.
  No `setInterval`: the dashboard owns one `FS.live` task per widget, so pause, back-off, stale and the
  user's interval apply. A child element with its own `source` polls through `FS.live` too; prefer static
  child elements fed from `load` (`ring.set`, `sparkline.set`, `kv-list.update`).
- **States:** loading (skeleton), empty (`load` → `false`), error (first load fails, compact with retry) and
  stale (later failures dim the widget) come from the dashboard. Do not invent others.
- **Updates in place:** lists keep their rows (`keyed()` in `widgets/util.js`), so focus and hover survive
  a refresh. Keep histories for sparklines in `ctx.state` and call `set(values)`.
- **Destructive actions** ask first (`FS.confirm`), like Stop in the Services widget.
- **Text:** every visible string through `t()`; numbers in `fs-num` (tabular); status through `statusNode`
  (icon or dot plus text); colours from tokens only.
- **Size:** the widget must work at every size it declares and at 375 px (the grid is one column then).
  Use container queries on `fs-widget` for narrow layouts (the core styles do for rows and the log).

## Package plugins

A package plugin calls `FS.widgets.define()` from its plugin script (loaded through `FS.plugins`). The
type appears in the catalogue under its category, and saved layouts that already contain it mount it as
soon as it is defined (`fs:widget-defined`). When the package is removed, its widgets show "Widget not
available" with a Remove option, and stay in the layout until removed.
