# release-card

The head of the Update Center: the installed version, build, channel,
FreeBSD base, architecture and boot environment; the available update with
its release notes; "Update now" and "Check now"; and when the next automatic
check runs. "Update now" asks first (`FS.confirm`), starts the update
(`POST` → job id) and hands the id to the `job` element with `fs:job-start`.

Release notes arrive as markdown-ish text and are rendered safely: `#`
headings, `-`/`*`/`1.` list items and paragraphs become DOM nodes with
`.text()`; `` `code` `` becomes `<code>`; other markers are dropped. Nothing
from the notes is ever parsed as HTML.

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `title` | string | `FreeSense version` | Card title |
| `source` | `{path}` | `/v1/system/version` | `{product, version, build, channel, arch, freebsd, boot_environment, update: {available, latest, checked, schedule}}` |
| `changelog` | `{path}` \| `false` | `/v1/system/update/changelog` | `{notes, version, date, url}` (or a string); loaded when an update is available |
| `update` | `{method, path, body}` | `POST /v1/system/update` | Starts the update; answers `{id}` |
| `check` | `{method, path}` | `POST /v1/system/update/check` | "Check now"; answers the new `update` object and `meta.message` |
| `schedule` | string | `update.schedule` | Automatic check text, e.g. `Daily at 06:00 UTC` |
| `gate` | CSS selector | — | A `preflight` element that must allow the update |
| `channel` | string | `update` | `channel` sent with `fs:job-start` |
| `confirmText` | string | default text | Body of the confirmation |
| `devNote` | bool | `true` | "Development builds are experimental and unsupported." on development channels |
| `every` | seconds | `0` | Refresh interval |

## Behaviour

- Update available: info status with the new version, release notes (collapsible, scrolls after 16 rem), Update now (primary) and Check now.
- Up to date: "FreeSense is up to date" and Check now.
- The Update now button is disabled, with a hint, while the gate's checks run or fail, and while an update job runs (`fs:job-state` / `fs:job-done` on the page). After a successful job (or Close) the version reloads.

## Builder (PHP, P4)

```php
$ui->releaseCard()->schedule(gettext('Daily at 06:00 UTC'))->gate('#update-preflight');
```

## Instance API

`reload()` reloads the version; `version()` returns the last payload.

## Events

`fs:job-start [{id, title, channel}]` on the node (bubbles) after an update was started.
Listens on the document to `fs:preflight`, `fs:job-state`, `fs:job-done`, `fs:job-closed`.

## Accessibility

- Version facts are a description list; the update state is a `status` (icon + text).
- Release notes use real headings and lists inside a `<details>` with a summary.
- The disabled Update now button is described by its hint text. Check now shows `aria-busy` while it runs and keeps focus on the button after the refresh.
- Buttons fill the row and are 40 px high on phones.
