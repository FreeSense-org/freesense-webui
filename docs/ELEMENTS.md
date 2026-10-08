# Element catalogue

`@freesense/ui` contains **every** element a page may use. A page that needs
something new gets it added here first (RULES R1). The catalogue's version is the
contract with pages, themes and packages (RULES R9).

Status: **2.0.0-draft.** Each element below is *planned* until its folder with
spec, fixtures, gallery entry and tests exists in `packages/ui/elements/`.

## Contract for every element

- **Builder:** `$ui-><name>(...)` in PHP. It emits `<div data-fs-el="<name>" data-fs-config='{...}'>` and a skeleton.
- **Behaviour:** `FS.el.define('<name>', { init(el, config), update(data), destroy() })`.
- **States:** default, loading (skeleton), empty, error (with retry), stale, disabled. Each has a gallery fixture.
- **Data:** declared as `source` (API path + query) and `every` (seconds, 0 = once). Loading goes through `FS.live`/`FS.batch`.
- **Accessibility:** a keyboard map, ARIA roles and live regions are documented in `spec.md`.
- **Theming:** only through tokens and the element's documented skin map.

## Shell

| Element | Purpose |
|---|---|
| `app-shell` | Centered top bar with mega dropdowns + optional left card menu (multi-page features) + content; layout `full` or `menu` |
| `area-menu` | Top-level areas in the top bar, with overflow on narrow screens |
| `section-menu` | Left menu of an area's sub-pages; slides in/out; collapsible to a rail; drawer on phones |
| `command-palette` | Ctrl+K: search pages, settings and actions |
| `breadcrumb` | Area › section › page |
| `page-header` | Title, subtitle, one primary action, secondary actions, status chips |
| `tabs` | Page tabs, with overflow into "More" |
| `view-switch` | Segmented switch between views of the same data |
| `notifications` | Bell with count; drawer of notices; dismiss |
| `profile-menu` | Avatar, name, quick theme/mode switch, links to profile and sessions, sign out |
| `avatar` | Image or initials on a colour; sizes xs–xl; presence dot |
| `status-bar` | Hostname, version, uptime, live state, pending changes |
| `sign-in` | Sign-in page and session-expired dialog |

## Layout

| Element | Purpose |
|---|---|
| `grid` | Responsive 12-column layout for page sections |
| `section` | Titled group of content, with an optional description and actions |
| `card` | Surface with header, body and footer slots |
| `split-view` | List + detail side by side; stacks on narrow screens |
| `drawer` | Side panel for details or quick edits |
| `toolbar` | Search, filters, bulk actions and view options above a collection |
| `stepper` | Multi-step flows (setup wizard, VPN wizards) |

## Data

| Element | Purpose |
|---|---|
| `data-table` | API-backed table: paging (client/server), sort, search, filters, column chooser, bulk select, row actions, inline toggle, drag + keyboard reorder, live cells, row → card on phones |
| `kv-list` | Key–value details |
| `stat-tile` | Big number with label, trend and sparkline |
| `meter` | Horizontal usage bar with thresholds |
| `ring` | Circular gauge |
| `sparkline` | Tiny inline trend |
| `chart` | uPlot time series: history (RRD) then live stream; hover readout; range picker |
| `log-viewer` | Cursor-based live tail + older pages, filters, row detail, "N new" pill |
| `tree-table` | Hierarchical rows (traffic shaper, certificates chain) |
| `console` | Monospace command/tool output with copy and live append |
| `status` | Marker + text for up/down/warning/unknown, pass/block/reject/match |
| `badge` / `chip` | Small labels; chips can be toggles |
| `empty-state` | Illustrative empty state with a primary action |
| `topology` | Interfaces, gateways and networks as a live diagram (dashboard and Network) |

## Forms

| Element | Purpose |
|---|---|
| `form` | Schema-driven form: sections, collapsible advanced, sticky action bar, dirty guard, inline + summary errors (422), visibility rules, Ctrl+S |
| `field-text` | Text, with an optional prefix/suffix |
| `field-number` | Number with min/max/step and unit |
| `field-secret` | Password/key with reveal and generate |
| `field-select` | Single select; searchable when long |
| `field-checklist` | Searchable multi-select |
| `field-switch` | Boolean switch |
| `field-segmented` | Small set of exclusive options |
| `field-textarea` | Multi-line text; code mode |
| `field-address` | IP / CIDR / host / alias with validation and an alias typeahead |
| `field-port` | Port, range or port alias |
| `field-typeahead` | Free text with suggestions from an API source |
| `entry-grid` | Repeatable rows of fields (add, remove, reorder) |
| `field-file` | File upload with progress |
| `field-datetime` | Date/time and schedule ranges |
| `field-color` | Accent picker limited to a theme's contrast-checked list (Appearance) |
| `field-avatar` | Upload + crop, or initials + colour |

## Feedback

| Element | Purpose |
|---|---|
| `toast` | Transient result messages |
| `confirm` | Confirmation dialog |
| `danger-confirm` | Type-to-confirm for destructive actions |
| `modal-form` | Small form in a dialog |
| `apply-bar` | Pending changes + Apply / Discard |
| `callout` | Inline info, warning or danger message |
| `job` | Long operation: progress, live log (cursor), survives reload, reconnects after reboot |
| `live-indicator` | Live/paused/stale state with a pause control |

## Dashboard

| Element | Purpose |
|---|---|
| `dashboard` | Widget grid (12 columns, sizes sm/md/lg/xl/full), edit mode, drag + keyboard move, per-widget refresh and settings |
| `widget-catalogue` | Add widgets, grouped and searchable |

Widgets are JS modules with a declared contract (title, icon, sizes, sources,
settings, `mount`/`load`). Core widgets live in `app/widgets/`; package widgets
register through `FS.plugins`.

## Identity and update

| Element | Purpose |
|---|---|
| `profile-card` | User summary: avatar, name, role, last sign-in |
| `theme-picker` | Live preview grid of theme × mode × accent × density |
| `session-list` | Active sessions with device, IP and age; revoke |
| `release-card` | Version, channel, release notes |
| `preflight` | Checklist with pass/warn/fail items before an operation |
| `be-timeline` | Boot environments as a timeline: active, previous, snapshots; activate/rollback |
