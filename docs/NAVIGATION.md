# Navigation

> **Agreed 2026-10-08.** The area structure below replaces the 1.x
> menus (System, Interfaces, Firewall, Services, VPN, Status, Diagnostics).

## Shell

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◆ FreeSense   Dashboard  Network  Security  VPN  Services  Insights  Tools  System │ Ctrl+K [apply] [bell] [mode] (avatar) │  ← top bar (always)
├──────────────┬───────────────────────────────────────────────────────────────┤
│ NETWORK      │  Interfaces                                  [+ Add] [Apply]  │
│ Interfaces * │  ───────────────────────────────────────────────────────────  │
│ Assignments  │                                                               │
│ VLANs        │   page content (elements)                                     │
│ Bridges      │                                                               │
│ …            │                                                               │
└──────────────┴───────────────────────────────────────────────────────────────┘
   ↑ section menu: slides in on `section` pages, slides away on `full` pages
```

(Bracketed words in the sketch stand for Font Awesome icons.)

- **Top bar** (always visible):
  - logo, areas, command palette (Ctrl+K), Apply-pending indicator, notifications, live/pause, theme/mode quick switch;
  - profile menu (avatar): Profile, Appearance, Sessions, Sign out.
- **Section menu** (left):
  - shown on pages with `LAYOUT = 'section'`; lists the area's sub-pages, grouped, with icons;
  - it slides in when you enter the area from a full-width page and slides away when you go to a full-width page. Moving between pages of the same area leaves it in place;
  - can be collapsed to an icon rail, remembered per user;
  - on phones it is an off-canvas drawer opened from the area title.
- **Full-width pages** (`LAYOUT = 'full'`): Dashboard, Topology, Update Center, Profile, Setup wizard.

## Areas

| Area | Layout | Section menu |
|---|---|---|
| **Dashboard** | full | — |
| **Network** | section | Interfaces · Assignments · VLANs · VXLAN · QinQ · Bridges · LAGG · GIF/GRE · Wireless · PPPs · Interface groups — *Routing:* Gateways · Gateway groups · Static routes — *Addressing:* DHCP server · DHCPv6 · Router advertisements · DHCP relay · DNS resolver · DNS forwarder · Dynamic DNS |
| **Security** | section | Firewall rules · NAT (port forward, outbound, 1:1, NPt) · Aliases · Schedules · Virtual IPs · Traffic shaper · Limiters — *Packages:* IDS/IPS, threat feeds, CrowdSec … |
| **VPN** | section | WireGuard · OpenVPN · IPsec · L2TP |
| **Services** | section | NTP · SNMP · UPnP & NAT-PMP · Wake-on-LAN · IGMP proxy · Captive portal · Package services |
| **Insights** | section | Logs · Traffic graphs · Interfaces status · Gateways status · Services status · States · DHCP leases · ARP/NDP · CARP · System activity |
| **Tools** | section | Ping · Traceroute · DNS lookup · Test port · Packet capture · Command prompt · Edit file · Backup & restore · Config history · Factory reset |
| **System** | section | General · Users & groups · Authentication servers · Certificates · Update Center · Packages · High availability · Advanced · Tunables · Notifications · REST API |

The profile is not under System. It lives under the avatar (`/me`).

## URLs

- Clean, lowercase, hyphenated: `/network/interfaces`, `/security/rules?if=wan`, `/security/rules/edit/12`, `/system/update`.
- State that matters for a deep link (selected interface, tab, filter, view) is in the query string.
- Old 1.x URLs (`*.php`) are not mapped (no legacy). At cutover, unknown old URLs land on the dashboard.

## Packages

Package plugins declare their pages with an area, an optional section group, an
icon and a privilege. They appear in the section menu of that area. A package
cannot add a new top-level area.
