# profile-menu

The avatar button at the right of the top bar and its account dropdown:

- **Header:** avatar, name, email, role pill and `@username`.
- **Appearance:** Light / Dark / Auto segmented switch and the accent swatches of the current theme (from `/themes/<theme>/theme.json` → `accents`).
- **Links:** Profile, Appearance, Sessions.
- **Sign out.**

Appearance changes apply instantly through `FS.theme.set` and are saved with
`PUT /v1/me/preferences` (the full `{theme, mode, accent, density}`). If the
save fails, the previous appearance comes back and a message explains why.

Optionally (`modeToggle`) a separate quick Light/Dark button sits before the avatar.

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `links.profile` | URL | `/me` | Profile page |
| `links.appearance` | URL | `/me#appearance` | Appearance section |
| `links.sessions` | URL | `/me#sessions` | Sessions section |
| `signOut.path` | API path | — | `POST` target for sign-out; without it (gallery) Sign out only reports |
| `signOut.redirect` | URL | `/` | Where to go after signing out |
| `modeToggle` | bool | `false` | Show the quick Light/Dark button |
| `user` | object | — | Use this user instead of the API (`/v1/me/profile`) (fixtures, server-side prefill) |

The user comes from `GET /v1/me/profile` and `/v1/me/preferences`, shared with every other element through the
identity cache, so the top bar makes one request.

## Builder (PHP, P4)

```php
$ui->profileMenu()->links('/me', '/me#appearance', '/me#sessions')->signOut('/v1/auth/session')->modeToggle();
```

The Shell renders it in the top-bar tools; pages never add it.

## Instance API

`open()`, `close()`. `import { signOut } from '../profile-menu/profile-menu.js'` is used by the command palette.

## Events

- Listens to `fs:theme` (keeps the switch and swatches in sync with changes made elsewhere) and `fs:me` (profile saved).
- `fs:popover` closes other identity dropdowns when this one opens.

## Accessibility

- The trigger is a button with `aria-haspopup="dialog"`, `aria-expanded` and the accessible name "Account menu: <name>".
- The panel is a non-modal `role="dialog"`. Focus moves to the checked mode on open; Escape closes it and returns focus to the trigger; clicking or tabbing outside closes it.
- Mode and accent are `role="radiogroup"`s: arrow keys, Home and End move and select; only the checked option is in the tab order. Swatches have a name and show a check mark when chosen (not colour only).
- Touch targets grow to 40 px on phones; the panel becomes a full-width sheet below the top bar.
