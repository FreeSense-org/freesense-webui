# Page patterns

Pages are not templates. A page is a short definition that picks a **page pattern**,
and the pattern builds the page from catalogue elements. Patterns are part of
`@freesense/ui` and versioned with it (RULES R9). Fixing a pattern fixes every
page that uses it.

Most 1.x pages become a few lines of configuration. Only special pages write
their own `build()`, still using elements only (RULES R1).

## Patterns

| Pattern | For | Builds |
|---|---|---|
| `ResourcePage` | One API resource with list + editor (aliases, rules, NAT, VLANs, routes, users, certificates…) | List view: toolbar (search, filters, bulk actions), data table, row actions, empty/loading/error/stale states, live refresh. Editor view: schema form with sections, advanced, visibility rules, inline 422 errors, sticky save bar, dirty guard. Delete confirm, apply-pending bar |
| `SettingsPage` | One settings object (General, Advanced, NTP, SNMP, DNS resolver…) | Schema form, Save only, apply-pending bar where the API reports it |
| `StatusPage` | Read-only live status (gateways, interfaces, services, leases, ARP…) | Summary tiles + live data table or cards, refresh control, optional row actions (restart, wake…) |
| `LogPage` | A log (firewall, system, VPN, package logs) | Log viewer with live tail, cursor paging, filters, row detail drawer, summary |
| `ToolPage` | Diagnostic tools (ping, traceroute, DNS lookup, capture…) | Options form + run button → job/console output, history |
| `Page` | Special pages (Dashboard, Rules, Update Center, Profile, Interfaces, Topology) | Nothing by default; `build(Ui $ui)` composes elements |

## Common constants

Every page declares:

| Constant | Meaning |
|---|---|
| `ROUTE` | URL, e.g. `/security/aliases` |
| `AREA` | Navigation area (`network`, `security`, …) |
| `GROUP` | Optional section-menu group (`Routing`, `Addressing`, …) |
| `PRIV` | Privilege id (kept from 1.x, e.g. `page-firewall-aliases`) |
| `TITLE` | Page title (gettext) |
| `ICON` | Font Awesome name for the mega dropdown and card menu |
| `LAYOUT` | `section` (default) or `full` |

## Examples

### ResourcePage

```php
final class Aliases extends ResourcePage {
	const ROUTE    = '/security/aliases';
	const AREA     = 'security';
	const PRIV     = 'page-firewall-aliases';
	const TITLE    = 'Aliases';
	const ICON     = 'tags';
	const RESOURCE = 'firewall/aliases';             // API path + schema name
	const COLUMNS  = ['name', 'type', 'values', 'descr'];
	const FILTERS  = ['type'];
	const KEY      = 'name';
}
```

This yields:
- `/security/aliases`: the list;
- `/security/aliases/new` and `/security/aliases/edit/{name}`: the editor;
- the menu entry, the privilege mapping and every state.

Fields, labels, help, validation and show/hide rules come from
`GET /api/v1/schema/firewall/aliases`.

### SettingsPage

```php
final class Ntp extends SettingsPage {
	const ROUTE    = '/services/ntp';
	const AREA     = 'services';
	const PRIV     = 'page-services-ntpd';
	const TITLE    = 'NTP';
	const ICON     = 'clock';
	const RESOURCE = 'services/ntp';
}
```

### Hooks

Patterns expose small, named hooks instead of templates:
- `ResourcePage`: `columns()`, `rowActions()`, `bulkActions()`, `listHeader(Ui $ui)`, `editorAside(Ui $ui)`
- `StatusPage`: `tiles()`
- `SettingsPage`: `sections()` (order/grouping of schema sections)

A hook returns element configuration or calls the `Ui` builder. It never returns markup.

### Special page

```php
final class FirewallRules extends Page {
	const ROUTE = '/security/rules';
	const AREA  = 'security';
	const PRIV  = 'page-firewall-rules';
	const TITLE = 'Firewall rules';
	const ICON  = 'shield-halved';

	function build(Ui $ui): void {
		$ui->pageHeader()->primary('add', gettext('Add rule'), '/security/rules/new?if={if}');
		$ui->tabs()->source('/v1/firewall/rules/interfaces')->param('if');
		$ui->applyBar('/v1/firewall/pending', '/v1/firewall/apply');
		$ui->dataTable('rules')
			->source('/v1/firewall/rules', ['interface' => '{if}'])
			->schema('firewall/rules')
			->columns(['enabled', 'action', 'protocol', 'source', 'destination', 'gateway', 'schedule', 'descr', 'hits', 'states'])
			->reorder('/v1/firewall/rules/order')
			->toggle('enabled')
			->live(5, ['hits', 'states'])
			->rowLink('/security/rules/edit/{id}');
	}
}
```

## Expected shape of the port

Measured against the baseline inventory (`docs/inventory/`). Of the 208 pages:
- most list/editor pairs collapse into one `ResourcePage` each;
- settings forms become `SettingsPage`;
- status and log pages become `StatusPage`/`LogPage`;
- an estimated few dozen remain special pages.

The real porting work moves to the backend schema per resource, which the API
uses too.

## Implemented (P5)

The patterns live in `app/src/Patterns/`; pages in `app/pages/` and the list in
`app/pages.php`. What each one builds today:

| Pattern | Constants | Hooks | Builds |
|---|---|---|---|
| `ResourcePage` | `ROUTE`, `RESOURCE`, `KEY`, `APPLY` | `noun()`, `plural()`, `columns()`, `filters()`, `sort()` | List (`ROUTE`): header with Add, apply bar for the `APPLY` subsystem, data table (search, filters, paging, row link, edit/delete). Editor (`ROUTE/new`, `ROUTE/edit/{key}`): schema form from `/v1/schema/{RESOURCE}`, POST or GET+PUT, back to the list |
| `SettingsPage` | `ROUTE`, `RESOURCE`, `SCHEMA` | `subtitle()` | Schema form: GET and PUT `/v1/{RESOURCE}` |
| `StatusPage` | `ROUTE`, `SOURCE`, `KEY`, `EVERY` | `columns()`, `rowActions()`, `empty()`, `sort()`, `subtitle()` | Live data table with search and paging |
| `LogPage` | `ROUTE`, `LOG`, `TYPE`, `SEVERITY` | `subtitle()` | Log viewer on the API's `format=webui` |

Where a page sits in the menus and the privilege that opens it come from
`app/nav.json`, never from the page. Pilot pages: Aliases, NTP, Gateways,
Services, ARP table, and the firewall, system, DHCP, DNS and OpenVPN logs.
