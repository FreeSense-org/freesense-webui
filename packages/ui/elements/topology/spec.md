# topology (draft)

A live diagram of the firewall: WAN gateways on the left, the firewall in the
middle and the LAN/OPT networks on the right, joined by SVG connectors whose
style follows the status (down = dashed critical). Below 560 px wide the
columns stack and the connectors are hidden.

Data: `/v1/status/gateways`, `/v1/status/interfaces`, `/v1/status/traffic`
(rates) and `/v1/system/info` (hostname), loaded together every `every` seconds. Interfaces that
carry a gateway are shown as their gateways; the others are networks.

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `every` | seconds | `5` | Poll interval |
| `title` | string | hostname | Text on the firewall node (the hostname then shows below it) |
| `label` | string | `Network topology` | Accessible name of the diagram |
| `interfaces` | `{path, query}` | `/v1/status/interfaces` | Interfaces source |
| `gateways` | `{path, query}` | `/v1/status/gateways` | Gateways source |
| `system` | `{path, query}` | `/v1/system/info` | Hostname source (optional; failures are ignored) |
| `traffic` | `{path, query}` | `/v1/status/traffic` | Rates per interface (optional; failures are ignored) |

## Builder (PHP, P4)

```php
$ui->topology()->every(5);
```

## Instance API

`reload()`.

## Events

None.

## Accessibility

- The diagram is a `group` with two lists (Gateways, Networks) and the firewall node; it reads in order without the picture. Connectors are `aria-hidden`.
- Every node shows its state with the status element (icon + text) and, for gateways, the RTT or loss.
- Throughput arrows have visually hidden "In"/"Out" text.

## Known gaps

Draft: no gateway groups, VLAN parents, VPN peers or click-through yet; very
many networks make a tall right column.
