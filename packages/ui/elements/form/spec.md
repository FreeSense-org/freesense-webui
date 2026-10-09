# form

The schema-driven editor behind `ResourcePage` (editor view) and
`SettingsPage` (docs/PAGES.md). Fields, labels, help, validation and
show/hide rules come from the resource schema (`GET /api/v1/schema/{resource}`,
format in [schema.md](schema.md)); values come from a load path; Save goes
through `FS.api`.

- Sections render as cards; `advanced` sections are collapsed and open by themselves when they contain an error.
- `visibleWhen` / `enabledWhen` rules run live on every change.
- Labels sit above inputs at every width; `half`, `third` and `two-thirds` fields pair up on wide forms (container query, one column below ~34 rem).
- Dirty tracking: a sticky action bar shows "Unsaved changes"; Ctrl+S (Cmd+S) saves; reload/close (`beforeunload`), partial navigation (`a[data-fs-nav]`) and Cancel ask "Discard changes?" first (`FS.confirm`).
- Client-side checks (required, pattern, length, min/max, type rules such as addresses and ports) mirror the server. A 422 maps `error.details.fields` onto the fields; an error summary at the top takes focus and links to every field (rows of an entry grid included).
- Success: toast (`meta.message`), `fs:pending` when `meta.pending`, optional navigation (`successHref`, via `FS.nav.go`).
- Read-only mode (forced, or `readonlyWhen` on the loaded values, e.g. system rules): every field disabled and a callout explains why.

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `schema` | object | — | Inline schema (schema.md) |
| `schemaSource` | `{path, query}` | — | Load the schema, e.g. `{path: '/v1/schema/firewall/rules'}` |
| `values` | object | `{}` | Inline values (new records: defaults, prefilled fields) |
| `load` | `{path, query, field}` | — | `GET` the current values (`data`); with `field`, `data[field]` over `data` (a rule's `fields`, with its `id` and flags still there for `readonlyWhen` and placeholders) |
| `save` | `{method, path, body, pending}` | `PUT` | `PUT` \| `POST` \| `PATCH`; `{placeholders}` in the path are filled from the loaded values, then the form values (`/v1/firewall/aliases/{name}` keeps the old name on a rename); `body` holds constant fields sent with every save; `pending: true` shows the apply bar after a save (for APIs that stage changes without `meta.pending`) |
| `submitLabel` | string | `Save` (`Create` for POST) | Primary button |
| `cancelHref` | string | — | Cancel (or Back when read-only) navigates here; without it the bar offers "Discard changes", which resets the form |
| `successHref` | string | — | Navigate after saving; `{placeholders}` from the response data (e.g. `/security/rules/edit/{id}`) |
| `successMessage` | string | `Changes saved` | Toast when the response has no `meta.message` |
| `summary` | `true` \| string | — | Live summary sentence: `true` uses `schema.summary`, a string is its own template |
| `layout` | `cards` \| `plain` | `cards` | `plain` drops the card chrome (inside drawers and dialogs) |
| `sections` | string[] | — | Section order / subset by id (overrides `schema.order`) |
| `density` | `compact` | — | Tighter spacing for this form only |
| `readonly` | bool | `false` | Force read-only |
| `readonlyWhen` | Condition | `schema.readonlyWhen` | Read-only when the loaded values match |
| `readonlyTitle` / `readonlyText` | string | `Read only` / `This is a system rule and cannot be changed.` | Callout text (schema keys of the same name win over the defaults) |
| `keepHidden` | bool | `false` | Also send hidden fields |
| `errors` | `{name: message}` | — | Show these errors on first render (server-side validation of a non-JS post, gallery) |
| `errorMessage` | string | — | Text under the error summary title for `errors` |
| `errorFocus` | `summary` \| `field` | `summary` | What receives focus after a failed save |
| `label` | string | `schema.title` | Accessible name of the `<form>` |

## Builder (PHP, P4)

```php
// ResourcePage editor (generated from RESOURCE)
$ui->form()
   ->schema('firewall/rules')                       // → schemaSource /v1/schema/firewall/rules
   ->load('/v1/firewall/rules/{id}')
   ->save('PUT', '/v1/firewall/rules/{id}')
   ->cancel('/security/rules?if={if}')
   ->success('/security/rules?if={interface}')
   ->summary();

// SettingsPage
$ui->form()->schema('services/ntp')->load('/v1/services/ntp')->save('PUT', '/v1/services/ntp');
```

## Instance API

`FS.el.get(node)` returns:

| Method | Meaning |
|---|---|
| `values()` | Current values as the JSON that Save would send |
| `set(values)` | Set values (no dirty reset) |
| `validate()` | Run client checks, show errors; returns `true` when valid |
| `save()` | Validate and save; resolves with the response or `false` |
| `isDirty()` | Unsaved changes? |
| `reset()` | Back to the last loaded/saved values |
| `setErrors(map, message)` | Show server-style field errors |
| `field(name)` | Field instance (`get`, `set`, `setError`, `focus`, `setDisabled`) |

## Events (on the node)

| Event | Args | When |
|---|---|---|
| `fs:change` | values | Every edit |
| `fs:dirty` | bool | Dirty state changes |
| `fs:saved` | response | After a successful save |
| `fs:invalid` | entries | Client or server validation failed |
| `fs:pending` (document) | `{path}` | The save left changes to apply |

## Field types

Each type is its own element (`field-text`, `field-number`, `field-secret`,
`field-select`, `field-checklist`, `field-switch`, `field-segmented`,
`field-textarea`, `field-address`, `field-port`, `field-typeahead`,
`entry-grid`, `field-file`, `field-datetime`, `field-color`) that registers a
control builder with `fields.js` and can also be used on its own.
`fields.js` holds the registry, the field wrapper (label, help, inline error,
`aria-describedby`/`aria-invalid`), conditions, option loading and the shared
validation.

## Accessibility

- Every input has a visible `<label>`; group controls (checklist, segmented, entry grid, colour) are labelled groups. Required fields carry `aria-required` and a visual *.
- Help and error text are linked with `aria-describedby`; invalid inputs get `aria-invalid`. Errors are icon + text, never colour alone.
- The error summary is `role="alert"`, receives focus and links to each field; activating a link opens its section and focuses the field.
- Collapsible sections are buttons with `aria-expanded` / `aria-controls`.
- The status in the action bar is a polite live region ("Unsaved changes", "All changes saved").
- Comboboxes, typeaheads and listboxes follow the ARIA combobox pattern (`aria-activedescendant`, Escape closes and returns focus).
- Touch targets grow to 40 px on coarse pointers; motion follows `prefers-reduced-motion`.

## Known limits

- Browser Back/Forward (popstate) cannot be intercepted by the dirty guard.
- File uploads show real progress only with a live backend (the gallery mock answers without upload events).
