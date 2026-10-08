# notifications

The bell in the top bar. It polls `GET /v1/notices`, shows the unread count,
and opens a panel listing the notices: level icon, title, text (three lines at
most), age, an optional link and a dismiss button. "Dismiss all" appears when
there are two or more.

Dismissing is optimistic: the notice disappears at once, `DELETE
/v1/notices/{id}` runs, and on failure it comes back with a message.

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `source` | `{path, query}` | `{path: '/v1/notices'}` | Notices: `[{id, level, title, body, time, link, link_label?, read?}]` |
| `every` | seconds | `30` | Poll interval (paused while the tab is hidden) |
| `dismiss` | path template | `/v1/notices/{id}` | `DELETE` for one notice |
| `dismissAll` | path | `/v1/notices` | `DELETE` for all notices (**needs this backend route**) |
| `open` | bool | `false` | Open the panel on init (gallery) |

`level`: `danger`/`error`/`crit`, `warning`/`warn`, `info`, `success`/`ok`.
The unread count is every notice without `read: true`. A `link` starting with
`/` opens through partial navigation.

## Builder (PHP, P4)

```php
$ui->notifications()->source('/v1/notices')->every(30);
```

The Shell renders it in the top-bar tools.

## Instance API

`open()`, `close()`, `reload()` (fetch now).

## Events

- Emits `fs:popover` when opening, so other identity dropdowns close.
- Uses `fs:toast` (via the identity helpers) for dismiss results.

## States

The bell shows no count while loading or on error. The panel shows the shared
skeleton, empty ("You are all caught up"), error with retry, and dims the list
when the data is stale.

## Accessibility

- The bell is a button named "Notifications, N new" (or "Notifications"), with `aria-expanded`.
- A polite live region announces when the count goes up and when a notice is dismissed; it does not speak on every poll.
- Each level has a distinct icon shape plus hidden text ("Warning: "), never colour only.
- Dismiss buttons are named "Dismiss: <title>". After a dismiss, focus moves to the next notice (or back to the bell).
- Escape closes the panel and returns focus to the bell. On phones the panel is a full-width sheet and buttons are 40 px.
