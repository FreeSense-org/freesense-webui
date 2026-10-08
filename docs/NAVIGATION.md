# Navigation

> **Agreed 2026-10-08.** A centered layout like the 1.x WebUI, with mega
> dropdowns in the top bar and a left card menu for features with several pages.
> The area structure replaces the 1.x menus (System, Interfaces, Firewall,
> Services, VPN, Status, Diagnostics).

## Shell

```
 ┌──────────────────────────────────────────────────────────────────────────────────┐
 │      [FS] FreeSense │ Dashboard  Network v  Security v  VPN v  Services v …   [Search Ctrl K] [bell] [mode] (CA) │
 └──────────────────────────────────────────────────────────────────────────────────┘
          ┌──────────────────────────────── mega dropdown (VPN) ─────────────────┐
          │ VPN                                              [ Filter VPN…     ] │
          │ TUNNELS                                                              │
          │  WireGuard   4 pages    OpenVPN   4 pages    IPsec   4 pages   L2TP  │
          └──────────────────────────────────────────────────────────────────────┘

        ┌─ WireGuard ──┐  VPN / WireGuard
        │ Tunnels      │  Peers                                         [+ Add peer]
        │ Peers      * │  ───────────────────────────────────────────────────────
        │ Settings     │  page content (elements)
        │ Status       │
        └──────────────┘
        ← card menu: only on features with several pages; single pages use the full width
```

(Bracketed words stand for Font Awesome icons.)

- **Top bar:** contents are centered with the page.
  - The **areas** open mega dropdowns (grouped columns, icon headings, filter); **Dashboard** is a plain link.
  - **Tools:** search / command palette (Ctrl+K), notifications, light/dark, and the profile avatar (Profile, Appearance, Sessions, Sign out).
- **Card menu:** appears on the left of the content for multi-page features and replaces the 1.x tab bars.
- **Full-width pages:** dashboard, single pages, Update Center and Profile.
- **Phones:** areas in a drawer (accordion); the card menu becomes a horizontal scroller above the content.

The shell and its behaviour are specified in `packages/ui/elements/app-shell/spec.md`.

## Areas

| Area | Groups → items (*n* = multi-page feature with a card menu) |
|---|---|
| **Dashboard** | direct link |
| **Network** | *Interfaces:* Interfaces, Assignments (7: Assignments, VLANs, QinQ, Bridges, LAGG, GIF/GRE, Interface groups), Wireless · *Routing:* Gateways (3: Gateways, Gateway groups, Static routes) · *Addressing:* DHCP server (per interface + Relay + Settings), DNS resolver (5), Dynamic DNS, Router advertisements |
| **Security** | *Firewall:* Rules, NAT (4: Port forward, Outbound, 1:1, NPt), Aliases, Schedules, Virtual IPs · *Traffic:* Traffic shaper (4) · *Threat protection:* IDS/IPS, Threat feeds, CrowdSec (packages) |
| **VPN** | *Tunnels:* WireGuard (4: Tunnels, Peers, Settings, Status), OpenVPN (4), IPsec (4), L2TP |
| **Services** | *Network:* NTP, UPnP & NAT-PMP, IGMP proxy · *Security:* Captive portal, ACME · *Monitoring:* SNMP · *Other:* Wake-on-LAN, PPPoE server |
| **Insights** | *Activity:* Logs (6: Firewall, System, DHCP, DNS, VPN, Settings), Traffic, States · *Status:* Gateways, Services, DHCP leases, ARP/NDP |
| **Tools** | *Diagnostics:* Ping, Traceroute, DNS lookup, Test port, Packet capture · *Maintenance:* Backup & restore (3), Command prompt, Factory reset |
| **System** | *Setup:* General, Appearance, Advanced (6) · *Access:* Users & groups (4), Certificates (3), REST API · *Maintenance:* Update Center, Packages, High availability |

The profile lives under the avatar (`/me`), not in System. The gallery's
`gallery/app/nav.json` is the working model of this table.

## URLs

- Clean, lowercase and hyphenated, with the area first: `/network/interfaces`, `/vpn/wireguard/peers`, `/security/rules?if=wan`, `/system/update`.
- State that matters for a deep link (selected interface, filter, view) is in the query string.
- Old 1.x URLs (`*.php`) are not mapped (no legacy). At cutover, unknown old URLs land on the dashboard.

## Packages

- Package plugins declare their pages with an area, a group, an icon, a privilege and optional `pages` for a card menu. They appear in that area's mega dropdown.
- A package cannot add a new top-level area.
