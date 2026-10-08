# Architecture

## Overview

```
 Browser                                    Firewall
 ┌─────────────────────────────────┐        ┌───────────────────────────────────────────┐
 │ Shell (top bar + section menu)  │        │ nginx                                     │
 │ Page frame (server-rendered)    │◀──────▶│  /            → /usr/local/www-ui (2.0)   │
 │ Elements ── FS.el registry      │  HTML  │  /api/v1/*    → api/index.php (freesense) │
 │   │                             │        │                                           │
 │   ▼                             │  JSON  │ php-fpm                                   │
 │ FS.api / FS.live / FS.batch ────┼───────▶│  REST API → shared .inc logic → config    │
 └─────────────────────────────────┘        └───────────────────────────────────────────┘
```

The WebUI (this repository) and the backend (`freesense`) meet only at the
REST API. The WebUI never touches configuration or system state directly.

## Request flow

1. The browser requests `/security/rules`. nginx sends paths without a matching
   file to `public/index.php`, the router.
2. The router resolves the page class, checks the session and the page's privilege,
   then renders the shell and the page frame: header, tabs and one skeleton per element.
   No data is fetched, so the response is fast and never blocks.
3. `FS.el` finds every `[data-fs-el]` node and initialises its element. Each element
   reads its JSON config (`data-fs-config`), registers its data sources with `FS.live`,
   and renders when the data arrives.
4. On each 1 s tick, `FS.live` collects the tasks that are due. `FS.batch` sends them as
   one `POST /api/v1/batch` request, and the results go back to each element.
5. Writes go straight through `FS.api` (`PUT`/`POST`/`PATCH`/`DELETE`) with the
   `X-CSRF-Token` header. Validation errors come back as `422` with field keys, and the
   form element puts each message next to its field.
6. Links with `data-fs-nav` swap only the page frame (`[data-fs-main]`) and the section
   menu. The top bar stays in place, and `history.pushState` keeps Back/Forward and
   deep links working.

## Components

### Runtime (`packages/ui/js`)

| Module | Responsibility |
|---|---|
| `FS.api` | JSON client. Session cookie + `X-CSRF-Token`; `401` opens the sign-in dialog and retries; errors are normalised to `{status, code, message, fields}` |
| `FS.live` | The only scheduler. Per-task interval, no overlapping runs, exponential backoff (max 5 min), pause in hidden tabs, global pause, stale detection, per-page cleanup |
| `FS.batch` | Merges the GET requests due in the same tick into one `/api/v1/batch` call. At most 2 requests in flight |
| `FS.el` | Element registry. Auto-initialises `[data-fs-el]` nodes, including nodes added later (MutationObserver), and destroys them on removal |
| `FS.nav` | Partial navigation with section-menu transitions, focus management and scroll restore |
| `FS.theme` | Applies the user's theme, mode (light/dark/auto), accent and density live, with no reload |
| `FS.i18n` | Translated strings delivered by the page frame |
| `FS.plugins` | Registration point for package pages and dashboard widgets |

Libraries: jQuery 4 and Bootstrap 5.3 (JS bundle), installed from npm and
bundled with esbuild. uPlot draws charts.

### Elements (`packages/ui/elements/<name>`)

Each element has:
- `_<name>.scss`: styles built from tokens only.
- `<name>.js`: behaviour, registered with `FS.el.define('<name>', {...})`.
- `<Name>.php` (in `app/Ui`): the builder method that emits the element's frame and config.
- `spec.md`: purpose, options, states, events, accessibility, examples.
- `fixtures.json`: gallery states (default, loading, empty, error, stale, dense, long text, RTL-safe).

### Themes (`packages/theme-*`)

Tokens for both modes, optional skin maps, and a `manifest.json`. They compile
to `dist/public/themes/<name>/theme.css`. See THEMES.md.

### PHP app (`app/`)

| Part | Responsibility |
|---|---|
| `public/index.php` | Router: matches a route to a page class, checks auth and privilege, renders |
| `Page` | Base class: `ROUTE`, `PRIV`, `AREA`, `LAYOUT` (`full` or `section`), `TITLE`, `build(Ui $ui)` |
| `Ui` | Builder: one method per element; escapes everything; emits frame + skeleton + config |
| `Shell` | Top bar, section menu, profile menu, status bar |
| `Menu` | Area and section registry built from page classes and plugin manifests |
| `Session` | Reads the FreeSense GUI session; renders the sign-in page when there is none |

## Backend contract (in `freesense`)

- **Auth:** the GUI session cookie + `X-CSRF-Token` on `/api/v1`, alongside Bearer keys.
- **Meta:** `GET /api/v1/meta` returns the API level and capabilities. The WebUI declares the minimum level it needs.
- **Schemas:** `GET /api/v1/schema/{resource}` returns field definitions (types, labels, help, options, visibility rules) that forms and tables render from.
- **Batch:** `POST /api/v1/batch` with `[{id, method: "GET", path}]`.
- **Jobs:** `/api/v1/jobs` covers long operations (updates, package installs, captures) with a log cursor.
- **Errors:** `{"error": {"code", "message", "details": {"fields": {...}}}}`.

## Packaging

- `dist/` and `app/` are installed by the `security/FreeSense-webui` port (`NO_BUILD=yes`):
  - `app/` → `/usr/local/share/freesense-webui/app`
  - `dist/public` → `/usr/local/www-ui`
- `dist/` is committed. CI rebuilds it and fails if the result differs.
- Theme packages install into `/usr/local/www-ui/themes/<name>/`.
- Package UI plugins install into `/usr/local/share/freesense-webui/plugins/<pkg>/`.

## Versions

| Thing | Version | Declared where |
|---|---|---|
| WebUI / element contract | 2.x (semver) | `packages/ui/package.json` |
| Themes | own semver, `ui: "^2.0"` | `manifest.json` |
| API level | integer | `GET /api/v1/meta`; minimum in `app/config.php` |
