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
