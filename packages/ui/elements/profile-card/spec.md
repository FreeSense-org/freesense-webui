# profile-card

The signed-in user's summary: large avatar, name, `@username`, role, groups,
email, language, start page, last sign-in and member-since date.

**Edit** turns the card into a small inline form (name, email, language, start
page) that saves with `PUT /v1/me/profile`. A 422 response shows each
`error.fields` message under its input (`is-invalid`, `aria-invalid`,
`aria-describedby`) and a summary at the top; focus moves to the first invalid
field. On success the card, the profile menu and every other element showing
the user update at once (`fs:me`). A full `form` element replaces this inline
form later.

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `source` | `{path, query}` | `{path: '/v1/me'}` | User: `{username, name, email, role, groups[], avatar, initials, language, start_page, last_login, created}` |
| `every` | seconds | `0` | Refresh interval |
| `editable` | bool | `true` | Show Edit |
| `save` | API path | `/v1/me/profile` | `PUT` target |
| `languages` | `[{value, label}]` | built-in list | Language choices |
| `startPages` | `[{value, label}]` | from `#fs-nav` | Start-page choices (dashboard and every menu item) |

With the default source the card shares the `/v1/me` request with the profile menu.

## Builder (PHP, P4)

```php
$ui->profileCard()->source('/v1/me')->languages($languages);
```

## Instance API

`edit()` opens the form.

## Events

Emits `fs:me` (with the saved user) after a save; listens to it too.

## States

Skeleton, empty ("No profile"), error with retry, stale (dimmed).

## Accessibility

- The form has a name ("Edit profile"); every input has a visible label; hints and errors are linked with `aria-describedby`.
- Escape or Cancel leaves the form and returns focus to Edit. Save and Cancel are disabled while saving (`aria-busy`).
- The error summary is `role="alert"`.
- On phones Edit and the form buttons are full-width, 40 px targets.
