# The PHP app (page frames)

`app/` runs on the firewall. It renders **page frames only**: the shell (top bar,
mega dropdowns, card menu, drawer) and each page's elements as containers with
their config. Elements load all data themselves from `/api/v1` (RULES R2).

## Layout on the firewall

| Path | From | What |
|---|---|---|
| `/usr/local/www-ui/index.php` | `app/public/index.php` | Front controller |
| `/usr/local/www-ui/ui/` | `dist/public/ui/` | Engine: `fs-ui.css`, `fs-ui.js`, fonts, `manifest.json` |
| `/usr/local/www-ui/themes/<name>/` | `dist/public/themes/` | Built-in themes; theme packages add folders here |
| `/usr/local/share/freesense-webui/app/` | `app/` (without `public/`) | Bootstrap, router, builder, pages, templates, `nav.json` |

## URLs

- Pages: `/next/…` while WebUI 2.0 runs next to the 1.x GUI (`FS_WEBUI_BASE`); `/…` after the cutover.
- Engine and themes: `/ui/…` and `/themes/…`, the same before and after the cutover.
- nginx (freesense `system.inc`) adds these locations only when `index.php` is installed.
  Every `/next/` path goes to the one front controller; no URL names a PHP file.

## Request flow

1. `App::run()` turns the path into a route (`Url::route`). Unknown shapes are 404.
2. `/signin` is public (`SignIn`). Every other route needs a usable GUI session
   (`Session::current()`), otherwise a 303 to `/next/signin?next=…`.
3. The route's entry in `app/nav.json` names the privilege (1.x id) and, for
   package pages, the package. A missing package is 404; a missing privilege is 403.
   A user without the dashboard starts on the first page they may open.
4. The page class from `app/pages.php` builds the page with `Ui`; navigation
   entries without a class show `NotBuilt`.
5. `Shell::render()` wraps it in the user's theme, mode, accent and density
   (`/v1/me/preferences`), with the session's CSRF token in `<meta name="fs-csrf">`.

## Sessions and security

- One session for both UIs and the API. The backend decides everything:
  `restapi_session_problem()` (signed in, protocol, address, timeout),
  `restapi_session_user()` (account still active), `getAllowedPages()`
  (privileges, LDAP/RADIUS groups), `webgui_session_signin()` and
  `webgui_session_signout()` (`POST /api/v1/me/signout`).
- A page load counts as activity (like a 1.x page load) and refreshes the
  user's privileges.
- The sign-in form uses a double-submit token (a random cookie limited to
  `/next/signin`, SameSite=Strict). Failed sign-ins are logged by the backend,
  so login protection works as for the 1.x GUI. `next` only accepts WebUI pages.
- Pages accept GET and HEAD only; every change goes through the API.
- Frames are `Cache-Control: no-store`. Every value printed goes through `Html`
  (attribute JSON, script JSON, text).
- The app refuses to run against a backend with a lower REST API level than
  `FS_WEBUI_API_LEVEL`.

## The builder

`Ui` creates catalogue elements only. The catalogue is the `elements` list in
`ui/manifest.json`, so an element that is not in the engine cannot be used
(RULES R1). `$ui->pageHeader('Title')` is `page-header`, `$ui->kvList()` is `kv-list`.
`Element` takes any option fluently (`->icon('server')`) and has helpers for
lists (`action`, `primary`, `breadcrumb`, `chip`, `add`, `field`, `column`).
Elements nested as values become `{el, config}`, which containers render.

## Tests

`tests/app/AppTest.php` runs without a firewall (`php tests/app/AppTest.php`):
URLs and redirects, escaping, the builder, navigation filtering by privilege
and package, theme fallbacks, and the no-markup rule for pages. CI runs it in
`php:8.5-cli` against the committed `dist/`.

## Local preview

`npm run preview` runs the real PHP app against stubbed backend functions
(`app/dev/router.php`, `app/dev/backend.php`) in PHP's built-in server
(local `php`, or Docker `php:8.5-cli` on 127.0.0.1:8771), behind the gallery
server: open http://localhost:8770/next/. The gallery mock API answers the
`/api/v1` calls and is injected after `fs-ui.js`.

The mock mirrors the product API exactly (field names, envelopes, status
codes). The API in `freesense` is the contract: when they differ, fix the
mock and the elements, and change the backend only additively.

## Shipping to the firewall

The `FreeSense-webui` package (port `security/FreeSense-webui` in
freesense-system-ports) installs one pinned commit of this repository:
`app/` and the committed `dist/`. Nothing is built on the package builder.

1. Merge to `main` here (CI checks that `dist/` matches the sources).
2. `npm run port -- --ports ../freesense-system-ports` points the port at
   `origin/main`: it writes `GH_TAGNAME`, `DISTVERSION`/`PORTREVISION`,
   `distinfo` (GitHub's archive of the commit) and `pkg-plist`.
3. Open a pull request in freesense-system-ports; its CI
   (`tools/webui_port_audit.py`) checks the archive and the plist.

The port is a System root (freesense `tools/conf/pfPorts/poudriere_system`),
so a port update rebuilds the System repository only. It is not a dependency
of `FreeSense`: devices get it with `pkg install FreeSense-webui`, and the
first install regenerates the WebGUI configuration so nginx serves `/next/`.
