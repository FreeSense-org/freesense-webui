# preflight

A checklist shown before an operation (update, restore, factory reset,
package install): every check is pass, warn, fail, running or pending with a
detail line. An overall verdict sits on top, and a gate (`canProceed`) tells
other elements whether the operation may start. Problems sort first.

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `title` | string | `Before you continue` | Heading |
| `subtitle` | string | — | Muted line under the title |
| `source` | `{path, query}` | — | Checks from the API: an array or `{checks: [...]}` |
| `every` | seconds | `2` | Poll interval while any check is `running` or `pending` (stops when all are final) |
| `checks` | Check[] | — | Static checks (when there is no `source`) |
| `blockOnWarn` | bool | `false` | Warnings also close the gate |
| `sort` | bool | `true` | Fail, warn, running, pending, pass |
| `proceed` | `{label, icon, event}` | — | A primary button that is enabled only when the gate is open; emits `event` (default `fs:proceed`) |

**Check:** `{id, label, state: 'pass' | 'warn' | 'fail' | 'running' | 'pending', detail, help (link), helpLabel, stateLabel}`.

**Verdict:** fail → "N problems must be fixed first"; warn → "Ready, with N warnings"; running → "Checking… 3 of 5 done"; else "All checks passed".
`canProceed` is true when nothing failed, nothing is running or pending, and (with `blockOnWarn`) nothing warns.

## Builder (PHP, P4)

```php
$ui->preflight(gettext('Before you update'))->source('/v1/system/update/preflight');

$ui->preflight(gettext('Restore configuration'))
   ->check('parse', gettext('Backup can be read'), 'pass', gettext('XML valid'))
   ->proceed(gettext('Restore'), 'rotate-left');
```

## Instance API

| Method | Effect |
|---|---|
| `canProceed()` | The gate |
| `verdict()` | `{canProceed, state, label, fail, warn, busy}` |
| `checks()` | The current checks |
| `set(checks)` | Replace the checks |
| `reload()` | Run the checks again (source) |

## Events

`fs:preflight [{canProceed, verdict, label, fail, warn}]` on the node whenever the verdict changes (release-card's `gate` listens to it). `fs:proceed [{checks}]` from the proceed button.

## Accessibility

- The verdict is a polite `role="status"`, so a finished check run is announced once.
- Each state is a `status` pill (icon + text). Labels and details are real text.
- The re-run button has an accessible name; the proceed button is really `disabled` and carries the verdict as its title.
- Narrow containers stack the pill under the text; touch targets are 40 px.
