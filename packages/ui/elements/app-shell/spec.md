# app-shell

The frame around every page, in a **centered layout** like the 1.x WebUI:

- **Top bar:** full-width background; logo, areas and tools sit in the same centered container as the page.
  - **Areas** open **mega dropdowns**: grouped columns with icon headings and a filter field.
  - **Dashboard** is a direct link.
- **Body:** a centered container (`--fs-page-max`, 100 rem).
  - **Features with several pages** (WireGuard Tunnels/Peers/Settings/Status, NAT Port forward/Outbound/1:1/NPt, Logs Firewall/System/…) show a **card menu** on the left of the content. It replaces the 1.x tab bars.
  - **Single pages and the dashboard** use the full container width.
- **Phones (< 992 px):** the areas move into a drawer (accordion per area), and the card menu becomes a horizontal scroller above the content.

The server renders the shell (PHP `Shell`). This element adds the behaviour.

## Navigation model

`<script type="application/json" id="fs-nav">`, filtered by the user's privileges on the server:

```json
{ "areas": [
	{ "id": "dashboard", "title": "Dashboard", "icon": "gauge-high", "href": "/" },
	{ "id": "vpn", "title": "VPN", "icon": "lock", "groups": [
		{ "title": "Tunnels", "icon": "lock", "items": [
			{ "title": "WireGuard", "icon": "bolt", "href": "/vpn/wireguard", "pages": [
				{ "title": "Tunnels", "icon": "network-wired", "href": "/vpn/wireguard" },
				{ "title": "Peers", "icon": "users", "href": "/vpn/wireguard/peers" }
			] },
			{ "title": "L2TP", "icon": "plug", "href": "/vpn/l2tp" }
		] }
	] }
], "other": [ { "title": "Profile", "icon": "circle-user", "href": "/me" } ] }
```

An item with `pages` is a multi-page feature, and its pages form the card menu.
The layout follows from the model: a page found among an item's `pages` (or the
item itself, when it has pages) gets `data-fs-layout="menu"`; everything else
gets `"full"`.

## Behaviour

| Action | Result |
|---|---|
| Click an area | Its mega dropdown opens below it, clamped inside the container; the filter has focus |
| Hover another area while one is open | Switches to that area's dropdown (menubar behaviour, pointer devices only) |
| Type in the filter | Matching pages stay, with the match highlighted; empty groups hide; Enter opens the first match |
| ↓ / ↑ in the dropdown | Move between visible links; ↑ from the first link returns to the filter |
| Escape, click outside, focus leaves | Closes the dropdown (Escape returns focus to the area button) |
| Navigate within a feature | The card menu stays; only the current page changes |
| Navigate to another multi-page feature | The card menu content cross-fades |
| Navigate to a single page / dashboard | The card menu fades out and the content takes the full width |
| Phone menu button | Drawer with every area as an accordion; Escape or the scrim closes it; focus is trapped while open |
| The session expires (`fs:session-expired` from FS.api) | Goes to the sign-in page in `<meta name="fs-login">` with `next` set to the current page; without that meta (gallery) nothing happens |

Transitions use `--fs-dur-*` and are off under `prefers-reduced-motion`.

## Accessibility

- A skip link to `#fs-main`. After partial navigation the page's `h1` receives focus.
- Area buttons use `aria-expanded`/`aria-controls`. The active area is marked visually, and its links carry `aria-current="page"`.
- The drawer is a modal dialog while open.

## Skins (theme `skin`)

`<html data-fs-skin-topbar="surface|accent|inverse" data-fs-skin-section="surface|sunken|glass">`. `skin.sectionMenu` styles the card menu.

## Events

- `fs:navigated` `[{area, layout, page}]` after each partial navigation (from FS.nav).
