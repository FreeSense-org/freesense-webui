# Form schema format

Editors and settings pages render their fields from
`GET /api/v1/schema/{resource}` (docs/PAGES.md). The backend owns the schema;
the same rules drive the API's own validation, so the browser's checks only
mirror them for quick feedback. Every label, help text and message in a schema
is already translated by the server (gettext).

## Resource

```json
{
  "resource": "firewall/rules",
  "title": "Firewall rule",
  "summary": "{action} [{protocol} ]traffic on {interface} from {source}[ port {source_port}]",
  "summaryIcon": "shield-halved",
  "readonlyWhen": { "field": "system", "truthy": true },
  "readonlyTitle": "Read only",
  "readonlyText": "This is a system rule and cannot be changed.",
  "order": ["rule", "source", "destination", "options", "advanced"],
  "sections": [Section, …]
}
```

| Key | Meaning |
|---|---|
| `resource` | API resource (also the schema name) |
| `title` | Accessible name of the form |
| `sections` | Ordered sections (a schema with only `fields` is one untitled section) |
| `order` | Optional section order (SettingsPage `sections()` hook) |
| `summary` | Live summary sentence (see below), shown when the form config has `summary: true` |
| `summaryIcon` | Font Awesome name for the summary |
| `readonlyWhen` | Condition on the loaded values; when it holds the whole form is read-only |
| `readonlyTitle` / `readonlyText` | Callout shown in read-only mode |

## Section

```json
{ "id": "advanced", "title": "Advanced options", "description": "…", "advanced": true, "fields": [Field, …] }
```

| Key | Meaning |
|---|---|
| `id` | Stable id (used by `order` and `data-id`) |
| `title` | Card title; without one the section has no header |
| `description` | One or two sentences under the title |
| `advanced` / `collapsed` | Collapsible, collapsed by default (opens automatically when it contains an error) |
| `open` | With `advanced`: start open |
| `tag` | Badge next to a collapsible title (default "Advanced") |
| `visibleWhen` | Condition; hides the whole section |

## Field

| Key | Type | Meaning |
|---|---|---|
| `name` | string | Value key; dots nest (`advanced.max_states` → `{advanced: {max_states}}`) |
| `type` | string | One of the types below (default `text`) |
| `label` | string | Visible label, always above the input |
| `help` | string | Help text under the input (linked with `aria-describedby`) |
| `placeholder` | string | Example value, never instead of a label |
| `required` | bool | Must not be empty (marked with *) |
| `default` | any | Value when the loaded data has none |
| `readonly` / `disabled` | bool | Always disabled (shown, sent with the form) |
| `optionsFrom` | string | Dot path into the loaded values whose `{value: label}` map (or option list) becomes `options` (choices that depend on the item, e.g. an interface's `gateway_choices`) |
| `options` | array or object | Static `[{value, label, group, detail, icon, tone, disabled}]` (or plain strings), or dynamic `{source: {path, query}, value, label, group, detail, prepend, append}` where `value`/`label`/… are dot paths into each row |
| `min` / `max` / `step` / `unit` | number / string | Numeric range, step and unit suffix |
| `minLength` / `maxLength` | number | Text length |
| `minItems` / `maxItems` | number | Checklist size |
| `pattern` / `patternMessage` | regex / string | Text format and the message when it fails |
| `requiredMessage` | string | Overrides "{label} is required." |
| `multiple` | bool | `select` with several values (renders as `checklist`) |
| `visibleWhen` | Condition | Shown only when it holds; hidden fields are not validated or sent |
| `enabledWhen` | Condition | Enabled only when it holds; disabled fields are sent but not validated |
| `width` | `full` \| `half` \| `third` \| `two-thirds` | Columns on wide forms (one column below ~34 rem) |
| `prefix` / `suffix` | string | Text add-ons (`https://`, `ms`) |
| `mono` | bool | Monospace input (addresses, keys, names) |
| `badge` | string | Small tag after the label |

### Conditions

```json
{ "field": "protocol", "in": ["tcp", "udp", "tcp/udp"] }
{ "field": "interface", "equals": "floating" }
{ "field": "action", "notEquals": "block" }
{ "field": "enable", "truthy": true }
[ cond, cond ]                     all must hold
{ "any": [cond, cond] }            one must hold
```

Rules are evaluated live on every change (a few passes, so chained rules settle).

### Types

| Type | Element | Value | Extra keys |
|---|---|---|---|
| `text` | `field-text` | string (trimmed) | `inputType`, `autocomplete`, `trim: false` |
| `number` | `field-number` | number \| null | `min`, `max`, `step` (`'any'` for decimals), `unit` |
| `secret` | `field-secret` | string | `generate: true \| {length, charset: alnum\|hex\|base64\|strong}` |
| `select` | `field-select` | option value \| null | searchable when more than 10 options or `searchable: true`; `strict: false` accepts unknown values |
| `checklist` | `field-checklist` | array | searchable when more than 8 options; `inline` |
| `switch` | `field-switch` | bool (or `values: [off, on]`) | `text` (caption next to the switch) |
| `segmented` | `field-segmented` | option value | options with `icon`, `tone` (`pass`, `block`, `reject`, `match`, `ok`, `warn`, `crit`) |
| `textarea` | `field-textarea` | string | `rows`, `code` (monospace, no wrap, line count) |
| `address` | `field-address` | string (`!` prefix when inverted) | `invert`, `allow: [any, iface, ip, network, alias, fqdn]`, `aliasTypes` |
| `port` | `field-port` | string (`443`, `8000:8100`, `22, 443`, alias) | `emptyValue` (e.g. `any`), `range: false`, `alias: false` |
| `typeahead` | `field-typeahead` | string | `source: {path, query, param, value, label, detail, group}`, `suggestions`, `strict`, `minChars` |
| `entry-grid` | `entry-grid` | array of row objects | `fields` (columns: any type, `width: xs\|sm\|md\|lg\|xl\|auto\|<fr>`), `min`, `max`, `reorder`, `addLabel`, `emptyText` |
| `file` | `field-file` | upload response \| `{name, size, type, content}` | `accept`, `maxSize` (bytes), `upload: {path, query}` or `read: 'text' \| 'dataurl'` |
| `datetime` | `field-datetime` | string \| `{from, to}` \| `{days, from, to}` | `mode: datetime\|date\|time`, `range`, `days`, `min`, `max` |
| `color` | `field-color` | accent id \| null | `allowDefault`, `theme` |

## Values and errors

- **Load:** `GET` returns `{data: {...}}`; each field reads its `name` (dot paths).
- **Save:** the form sends one JSON object with every visible field, nested by dots.
- **422:** `{error: {code: 'validation_failed', message, details: {fields: {name: message}}}}`.
  Names match the schema; rows of an entry grid use `entries.2.value` or
  `entries[2].value` (0-based). Unknown names are listed in the error summary.

## Live summary

`summary` is a sentence template. `{name}` inserts the display text of a
field (option label, `not RFC1918_ALL`, `5 entries`…). A `[bracketed part]` is
left out when any field inside it is empty or hidden.
