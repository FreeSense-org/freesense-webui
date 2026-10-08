# Optional packages in WebUI 2.0

Today's packages talk to the 1.x WebUI directly. They have XML forms rendered by
`pkg.php`/`pkg_edit.php`, their own PHP pages, and `*.widget.php` dashboard widgets.
**None of them is reachable through the REST API.** The hook exists
(`pkg_call_plugins('plugin_restapi')` in `freesense/src/etc/inc/restapi/routes_v1.inc`),
but no package implements it. Because WebUI 2.0 is API-first, packages need an API
side and a UI side.

Baseline in freesense-packages:
- 36 package ports;
- 61 XML files with `<fields>`, 30 of them add/edit/delete lists;
- 103 PHP pages;
- 6 widgets;
- 3 packages with their own JS.

## 1. API side (backend, in the package)

### a) Generic bridge for XML packages (no package code)

The core API reads the package XML and exposes it automatically:

| Route | Source |
|---|---|
| `GET /api/v1/packages/{pkg}/forms` | Every XML form of the package |
| `GET /api/v1/schema/packages/{pkg}/{form}` | `<fields>` converted to a schema (types, labels, help, options, show/hide rules) |
| `GET/PUT /api/v1/packages/{pkg}/{form}` | Single settings forms (`<configpath>`) |
| `GET/POST /api/v1/packages/{pkg}/{form}/items`, `GET/PUT/DELETE …/items/{id}` | List forms (`<adddeleteeditpagefields>`) |

- Saving runs the package's existing hooks (`<custom_php_validation_command>`, `<custom_php_resync_config_command>`), exactly as `pkg_edit.php` does today.
- Privileges come from the package's existing page privileges.
- This covers most XML-only packages without changing them.

### b) Custom routes for PHP-heavy packages

Packages with their own PHP pages (WireGuard, Suricata, HAProxy, ACME, ThreatShield …) implement the existing hook:

```php
function <pkg>_plugin_restapi($args) {
	return array(
		restapi_route('GET', '/v1/packages/wireguard/tunnels', 'wg_api_tunnels', array('page' => 'page-vpn-wireguard', 'area' => 'vpn')),
		…
	);
}
```

They also ship resource schemas next to their routes. The logic moves out of their
PHP pages into the package's `.inc`, exactly like core pages (PORTING.md).

## 2. UI side (plugin, in the package)

A package ships a **plugin folder**, installed to `/usr/local/share/freesense-webui/plugins/<pkg>/`:

```
plugin.json        name, version, requires ui ^2.x and api >= N, pages, menu, widgets
pages/*.php        page definitions using the same page patterns (ResourcePage, SettingsPage, …)
widgets/*.js       dashboard widgets (widget contract)
```

```json
{
	"name": "wireguard",
	"version": "1.2.0",
	"ui": "^2.0",
	"api": 3,
	"pages": [
		{ "class": "WireGuardTunnels", "area": "vpn", "group": null, "icon": "network-wired" }
	],
	"widgets": ["widgets/wireguard.js"]
}
```

- **XML-only packages need no plugin at all.** The WebUI generates their pages from the generic bridge:
  - a list form becomes a `ResourcePage`, a settings form becomes a `SettingsPage`;
  - the menu entries come from the package's `<menu>`/`<group>` information.
- **Plugins are trusted code.** Packages are signed and installed by the administrator. That is why a plugin may ship widget JS, while a theme may not.
- **Versions:** a plugin that needs a newer `ui` or `api` than the system has is not loaded, and a notice says which package needs updating.
- **Rules:** RULES.md applies to plugin pages the same way. Elements only, patterns where they fit, and no markup.

## 3. Rollout (plan phase P8)

1. Generic XML bridge + auto-generated pages (core API and WebUI). Covers the XML-only packages.
2. Custom routes + plugins per package, largest first. Each package PR bumps its PORTREVISION, so only that package rebuilds.
3. Widgets rewritten to the widget contract.
4. Cutover gate: every package page in the inventory has a 2.0 counterpart.
