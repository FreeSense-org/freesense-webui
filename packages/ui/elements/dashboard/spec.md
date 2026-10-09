# dashboard

The FreeSense dashboard: a responsive 12-column grid of widgets. Every widget
is a registered widget type (`FS.widgets.define`, contract in
[widgets.md](widgets.md)) with its own live task, refresh interval, size and
settings. Several copies of one type can sit side by side with different
settings (Traffic for WAN and for LAN). The layout is saved per user.

## Behaviour

- **Grid:** sizes `sm` (3 columns), `md` (4), `lg` (6), `xl` (8) and `full` (12).
  The sizes follow the dashboard's own width (container queries):
  below 80 rem `sm` takes 4 columns; below 64 rem `sm`/`md`/`lg` take half and `xl` the full width;
  below 40 rem every widget is full width. Widgets in a row share the row height.
- **Widget chrome:** icon, title (custom title from settings), subtitle from the widget,
  a live dot and an options menu. Optional footer (for example "All services →").
- **Live dot:** `loading` (pulsing ring), `ok` (filled), `manual` (refresh off, ring),
  `stale` (amber ring), `error` (red diamond), `paused` (two bars; global live pause),
  `idle` (not yet in view). Shape and colour differ, and the state is in a tooltip
  and in visually hidden text.
- **Lazy loading:** a widget is mounted and starts its live task only when it comes within
  240 px of the viewport (IntersectionObserver). Widgets added by the user start at once.
- **Live pause:** every task runs through `FS.live`, so the global pause, hidden tabs and the
  error back-off apply. The dots switch to `paused`.
- **Menu (per widget):** Refresh now · Settings… · Collapse/Expand · Size (only the sizes the
  widget allows) · Refresh (Off, 2s, 5s, 10s, 30s, 60s) · Move earlier · Move later · Remove.
- **Settings:** `FS.modalForm` with a Title field plus the widget's `settings` fields; saved through
  `PUT <layout.path>/widgets/<id>` (the API validates and answers `{id, settings}`; 422 shows
  field errors). The widget then re-mounts with the new settings.
- **Remove:** removes at once and shows a toast with **Undo** (restores id, position, size and settings).
- **Edit mode:** an edit bar (Add widget, Reset, Done), dashed widget outlines and a drag handle
  on each widget. Drag with the pointer (mouse, pen, touch): a ghost follows the pointer, the
  widget shows where it lands, Escape cancels. On the handle, arrow keys move earlier/later and
  Home/End move to the first/last place.
- **Add widget:** opens the widget catalogue in a drawer; the new widget is appended, scrolled to,
  focused (its menu button) and briefly highlighted.
- **Reset:** `FS.confirm` (danger), then `DELETE <layout.path>` and the default layout.
- **Persistence:** `GET <layout.path>` on start (a skeleton grid meanwhile). `data` may be the widget
  list, `{widgets: [...]}` or `null` (use the defaults). Every change is saved with
  `PUT <layout.path>` `{...layout.query, widgets}`, debounced (`saveDelay`), and flushed when
  leaving edit mode, on `pagehide` and on destroy. When the layout cannot be loaded, the default
  layout is shown with a warning toast.
- **Page header:** the dashboard listens for `fs:action` from the page-header (ids in `actions`), so
  the header's Edit layout / Add widget / Reset buttons drive it.

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `layout` | `{path, query}` | `{path: '/v1/dashboard/layout', query: {style: 'default'}}` | Per-user layout API (GET, PUT, DELETE; `PUT …/widgets/{id}` for settings) |
| `persist` | bool | `true` | Load and save the layout. `false` = static (gallery, previews) |
| `widgets` | Widget[] | — | A fixed layout instead of loading one (implies nothing is loaded; saving still follows `persist`) |
| `defaults` | Widget[] | the core default layout | Layout for new users and after Reset |
| `editable` | bool | `true` | Allow edit mode |
| `editing` | bool | `false` | Start in edit mode |
| `lazy` | bool | `true` | Mount widgets when they come into view |
| `saveDelay` | ms | `800` | Debounce for saving |
| `actions` | `{edit, add, reset, done}` \| `false` | `{edit: 'edit-layout', add: 'add-widget', reset: 'reset-layout', done: 'done-layout'}` | `fs:action` ids (page-header buttons) the dashboard responds to |
| `linkBase` | string | `''` | Prefix for the widgets' page links (the gallery uses `/gallery/app`) |
| `links` | object | — | Override single widget links, e.g. `{update: '/system/update'}` |

**Widget** (layout entry): `{ id, type, size, every, collapsed, settings }`. `id` is created when
missing; `every` overrides the type's default interval (0 = off); `settings` are merged over the
type's defaults. An unknown `type` shows "Widget not available" until a plugin defines it
(`fs:widget-defined`), and stays in the layout.

The default layout (1600 px: three rows of medium widgets around a wide Traffic chart):
System · Resources · Gateways / Traffic (xl) · Interfaces / Services · VPN tunnels · Notices /
Firewall log (lg) · Top talkers (lg) / DHCP leases · State table · Quick actions.

## Builder (PHP, P4)

```php
$ui->pageHeader(gettext('Dashboard'))->subtitle($hostname)
   ->primary('edit-layout', gettext('Edit layout'), 'pen-to-square', variant: 'secondary')
   ->action('add-widget', gettext('Add widget'), 'plus')
   ->action('reset-layout', gettext('Reset'), 'rotate-left');
$ui->dashboard()->layout('/v1/dashboard/layout')->defaults($defaultLayout);
```

## Instance API

`FS.el.get(node)`:

| Method | Effect |
|---|---|
| `add(type, settings?, size?)` | Add a widget; returns its id |
| `remove(id)` | Remove a widget (with Undo toast) |
| `move(id, index)` | Move a widget to a 0-based position |
| `edit(on)` / `editing` | Enter or leave edit mode |
| `reset()` | Ask, then reset to the default layout; resolves `true` when reset |
| `openCatalogue()` | Open the widget catalogue |
| `layout()` | The current layout (what is saved) |
| `counts()` | `{type: n}` of the widgets on the dashboard |
| `refresh(id?)` | Refresh one widget or all |
| `flush()` | Save now |

## Events

On the dashboard node (jQuery, bubbling): `fs:widget-added [{id, type}]`, `fs:widget-removed [{id, type}]`,
`fs:dashboard-edit [{editing}]`. Listens on the document for `fs:action` (page-header), `fs:live-paused`
and `fs:widget-defined`. Widgets trigger `fs:applied` (Quick actions) and react to `fs:pending`.

## Core widgets

| Type | Category | Composes | Settings |
|---|---|---|---|
| `system` | System | badge, kv-list | hardware details |
| `resources` | System | ring or meter, sparkline (seeded from `/status/system/history`) | rings/bars, CPU trend |
| `thermal` | System | status, sparkline | warning and critical °C |
| `storage` | System | meter | include memory and swap |
| `notices` | System | callout (dismiss → `DELETE /notices/{id}`) | all / important only |
| `traffic` | Network | chart (history + live), chip | interface, start range, chips |
| `interfaces` | Network | status, sparkline | show down interfaces, trend |
| `gateways` | Network | status, sparkline (seeded from history) | trend, IPv6 gateways |
| `top-talkers` | Network | bars | network, count, rank by |
| `dhcp-leases` | Network | status, search | network, online only, rows |
| `states` | Security | meter, stat-tile, protocol mix bar | — |
| `firewall-log` | Security | status pills, cursor tail (`?after=`) | action filter, rows |
| `services` | Services | status, start/restart/stop (`FS.api`, `FS.confirm` before stop) | all / stopped, rows |
| `vpn` | VPN | status | type |
| `quick-actions` | Shortcuts | status, apply (`POST /firewall/apply`), backup and page links | page shortcuts |
| `metric` | Custom (New) | stat-tile, sparkline | label, API source, field, format, thresholds |

## Accessibility

- The grid is a `list`; each widget is a `listitem` region labelled by its title (h2 under the page h1).
- The options menu is a Bootstrap dropdown (arrow keys, Escape, focus return). Size and refresh are
  groups of toggle buttons with `aria-pressed` and full names ("Every 10 seconds", "Large").
- Keyboard reordering: Move earlier/later in every widget menu (also outside edit mode) and arrow
  keys / Home / End on the drag handle in edit mode. Moves are announced in a polite live region
  ("Gateways moved to position 2 of 13"); focus stays on the moved widget.
- Pointer dragging uses pointer events with capture (mouse, pen and touch), Escape cancels.
- Live values are never announced on every tick. The live dot has text, not only colour.
- Removing a widget moves focus to the next widget's menu; Undo restores and focuses it.
- Touch targets (menu, handle, row actions, menu segments) are 40 px on phones.
- Motion (dot pulse, new-row highlight, bars) stops under `prefers-reduced-motion`.

## Known gaps

- A table view for the Traffic chart is the chart element's gap.
- Package widgets declare privileges in their plugin manifest; the dashboard does not filter the
  catalogue by privilege yet (the API refuses what the user may not read).
