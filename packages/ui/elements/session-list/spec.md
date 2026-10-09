# session-list

The account's active sessions: device icon and browser/agent, IP address,
when it signed in and when it was last seen. The current session carries a
"This device" badge and comes first; the rest are sorted by last seen.

Any other session can be signed out. **Sign out** opens an inline confirmation
in that row; confirming runs `DELETE /v1/me/sessions/{id}` optimistically (the
row disappears, and comes back with a message on failure). With two or more
other sessions, **Sign out other sessions** asks for a second click within five
seconds, then signs them all out. The current session is never offered (use
Sign out in the profile menu).

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `source` | `{path, query}` | `{path: '/v1/me/sessions'}` | Sessions (the API's shape): `[{id, current, address, agent, authsource, signed_in, last_seen}]`; `agent` is the raw user agent, shown as "Chrome 141 on Windows" |
| `every` | seconds | `30` | Refresh interval |
| `revoke` | path template | `/v1/me/sessions/{id}` | `DELETE` for one session |
| `revokeOthers` | bool | `true` | Show "Sign out other sessions" |
| `title` | string | "Active sessions" | Card title |

## Builder (PHP, P4)

```php
$ui->sessionList()->source('/v1/me/sessions')->every(30);
```

## Instance API

`reload()` fetches now.

## Events

Uses `fs:toast` (via the identity helpers) for results.

## States

Skeleton, empty ("No active sessions"), error with retry, stale (dimmed). A
refresh does not re-render while a confirmation in the list has focus.

## Accessibility

- Each Sign out button is named "Sign out <agent>" and has `aria-expanded` for its confirmation.
- The confirmation is a labelled group; focus moves to Cancel; Escape cancels and returns focus to the row's button.
- Results are announced in a polite live region.
- The confirm is local to this element until the shared `confirm` element lands; then it switches to it.
- On phones the rows stack and every button is 40 px tall.
