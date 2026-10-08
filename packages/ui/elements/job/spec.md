# job

Runs and follows a long operation (update, package install, backup, restore)
through `GET /v1/jobs/{id}`: title, progress (`meter`), current step, elapsed
time and a live log (`console`). It ends with a success or failure state and
the actions Retry, View log and Close. Long work never blocks a page
(RULES R3): the job id is kept in the URL (`?job=`), so a reload, a partial
navigation or a new tab picks the job up again. While the firewall cannot be
reached (reboot, 5xx, network error) it shows "Waiting for the firewall to
come back…" and polls every 2 s until the job answers again.

## Job API

`GET /v1/jobs/{id}?after=<line>` →
`{id, title, state: 'running' | 'succeeded' | 'failed', progress (0-100), step, step_index, steps, started, finished, error, log: [{n, t, text, level}]}`,
`meta.cursor` = the last line number. `404` = the job is gone.
Starting a job is any request that answers `{id}` (e.g. `POST /v1/system/update`).

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `id` | string | — | Follow this job at once |
| `source` | path template | `/v1/jobs/{id}` | Job endpoint |
| `urlParam` | string \| `false` | `job` | Query parameter that keeps the id; read on load, written on start, removed on Close |
| `listen` | event name \| `false` | `fs:job-start` | Document event that hands over a job `{id, title, channel}` (release-card, page actions) |
| `channel` | string | — | Only accept `listen` events with this `channel` |
| `start` | `{method, path, body, title, label, icon, auto}` | — | Request that creates a job: a button in the idle state, or run at once with `auto` |
| `retryAction` | `{method, path, body}` | `start` | Request for Retry after a failure |
| `retry` | bool | `true` | Offer Retry on failure (needs `retryAction` or `start`) |
| `hideIdle` | bool | `false` | Hidden until a job starts (and after Close) |
| `idleTitle`, `idleText` | string | `No operation running` | Idle state text |
| `title` | string | `Operation` | Title until the job reports its own |
| `jobTitle` | string | — | Title for `id` before the first answer |
| `successLabel`, `failureLabel` | string | `Finished successfully`, `Failed` | Final status text |
| `successAction` | `{label, href, icon}` | — | Primary link after success (e.g. to the boot environments) |
| `every` | seconds | `1` | Poll interval |
| `logHeight` | CSS length | `16rem` | Height of the log |

## Behaviour

- While running: icon, title, "Step 3 of 8: Verifying signatures", elapsed time, progress meter and the log (auto-scrolling).
- Succeeded: green status with the duration, the log collapses ("View log"), `successAction` and Close.
- Failed: red status, the log stays open, Retry (starts a new job), View log, Close.
- Connection lost: a warning panel with the seconds since the last answer; the elapsed time keeps counting; polling resumes on its own.
- Other errors (403, …): the error text with Try again and Close. `404`: "Not available" with Close.

## Builder (PHP, P4)

```php
$ui->job()->hideIdle()->channel('update')
   ->successAction(gettext('View boot environments'), '#boot-environments', 'hard-drive')
   ->retryAction('POST', '/v1/system/update');

$ui->job()->start('POST', '/v1/system/backup', label: gettext('Back up now'), icon: 'box-archive');
```

## Instance API

| Method | Effect |
|---|---|
| `attach(id, {title})` | Follow an existing job |
| `start(request?)` | Create a job (default: `start`) and follow it |
| `close()` | Stop following, clear `?job=`, back to idle |
| `current()` | `{id, state}` or `null` |

## Events

On the node (bubbling): `fs:job-state [{id, state, progress}]`, `fs:job-done [{id, state}]`, `fs:job-closed [{id}]`.
Input on the document: `fs:job-start [{id, title, channel}]`.

## Accessibility

- The title is a heading; progress is the `meter` element (a labelled progressbar).
- Completion, failure, connection loss and recovery are announced once in a polite live region; log lines are not.
- The final state is a `status` (icon + text). View log is a toggle with `aria-expanded`.
- The spinning icons stop under `prefers-reduced-motion`. Buttons are 40 px high on touch screens.
