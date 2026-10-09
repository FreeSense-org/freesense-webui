# be-timeline

Boot environments and their snapshots as a vertical timeline, newest first:
the active environment, the one used at the next boot, previous versions and
snapshots, each with version, date and size. Actions per entry: activate a
boot environment for the next boot after `FS.confirm`, rename a boot
environment that is not running (`FS.modalForm`), delete (`FS.dangerConfirm`,
type the name). Snapshots can be deleted only, as on the 1.x page.
"Snapshot now" saves the running system.

## API

| Request | Meaning |
|---|---|
| `GET /v1/system/boot-environments` | `[{name, kind: 'be' \| 'snapshot', active, next_boot, version, created (unix time), size, description, locked, parent}]`, newest first, `meta: {pool, free}`; 409 `no_boot_environments` without ZFS |
| `POST /v1/system/boot-environments` `{name?}` | Snapshot now |
| `POST /v1/system/boot-environments/{name}/activate` `{confirm: true}` | Use at the next boot (boot environments only; 409 for locked ones) |
| `PATCH /v1/system/boot-environments/{name}` `{name}` | Rename (422 with `fields.name`; 409 for the running one and for snapshots) |
| `DELETE /v1/system/boot-environments/{name}` | Delete (409 for the active or next-boot one) |

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `title` | string | `Boot environments` | Heading |
| `source` | `{path, query}` | `/v1/system/boot-environments` | List |
| `paths` | `{activate, snapshot, rename, remove}` | the routes above | Request paths (`{name}` placeholder) |
| `readOnly` | bool | `false` | No actions (dashboards, reports) |
| `reloadOn` | event names | — | Document events that reload the list, e.g. `fs:job-done` after an update |
| `every` | seconds | `0` | Refresh interval |

Badges: **Active** (ok), **Next boot** (info), **Snapshot**, **Locked** (e.g. a 1.0 environment on a 1.1 system: one-way upgrade).
Delete is disabled for the active and the next-boot entry; Activate is disabled for locked ones.

## Builder (PHP, P4)

```php
$ui->beTimeline()->reloadOn('fs:job-done');
$ui->beTimeline()->readOnly();
```

## Instance API

`reload()`; `items()` returns the current list.

## Events

`fs:be-changed [{action, name}]` on the node after a successful action.

## Accessibility

- An ordered list labelled with the title; markers are decorative (`aria-hidden`), the state is in the badges' text.
- Each entry's menu button is named "Actions for <name>"; the menu supports arrow keys and Escape.
- After an action, focus returns to the affected entry's menu (or Snapshot now when the entry is gone).
- The rename and delete dialogs label their inputs; delete needs the exact name.
