# avatar

A user's picture, or their initials on a colour. The colour comes from the
theme's series tokens (`--fs-series-1…8`), picked deterministically from the
username (or name), so a person keeps the same colour everywhere. Optional
presence dot.

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `name` | string | — | Full name; initials come from the first and last word |
| `username` | string | — | Colour key (preferred over `name`); fallback for initials |
| `initials` | string | from `name` | Override the initials |
| `src` | URL | — | Picture; on a load error the initials show |
| `size` | `xs` \| `sm` \| `md` \| `lg` \| `xl` | `md` | 1.25 / 1.75 / 2.25 / 3 / 4.5 rem |
| `color` | `auto` \| `accent` \| `1`–`8` | `auto` | `auto` = hash of username/name onto a series slot; `accent` = the user's accent |
| `presence` | `online` \| `away` \| `busy` \| `offline` | — | Dot at the bottom right; its meaning is in the accessible name and title |
| `label` | string \| `false` | name | Accessible name; `false` makes the avatar decorative (when a name is shown next to it) |
| `source` | `{path, query}` | — | Load `{name, username, initials, avatar}` from the API (e.g. `/v1/me/profile`) |
| `every` | seconds | `0` | Refresh interval for `source` |

## Builder (PHP, P4)

```php
$ui->avatar(gettext('Alex Morgan'))->username('alex')->size('lg')->presence('online');
$ui->avatar()->source('/v1/me/profile')->size('sm');
```

## Instance API

`FS.el.get(node).set({ name, src, presence, … })` re-renders in place.

## For other elements

`import { avatarNode, colorIndex } from '../avatar/avatar.js'` builds the same
markup (profile-menu, profile-card and lists use it).

`avatar/identity.js` holds helpers shared by the identity and shell-tool
elements: `t()` (FS.i18n when present), `notify()` (`fs:toast`, with a small
fallback bubble until the toast element exists), the shared signed-in user (`/v1/me/profile` + `/v1/me/preferences`)
(`me.get/set`, event `fs:me`), `prefs.save()` (FS.theme.set + PUT
/v1/me/preferences with rollback), theme metadata, the dropdown `popover()`,
radio-group keyboard helpers and `apiPath()`. Its shared parts (`.fs-idbtn`,
`.fs-id-count`, `.fs-id-panel`, `.fs-id-seg`, `.fs-id-swatch`) are styled in
`_avatar.scss`.

## Events

None.

## Accessibility

- With a label the avatar is `role="img"` with `aria-label` (name, plus presence in brackets); without one it is `aria-hidden`.
- Initials are `aria-hidden`; the picture has an empty `alt` because the wrapper carries the name.
- Presence is never colour only: the state is in the accessible name and `title`, and `offline` is a ring, not a filled dot.
- Initials colours mix the series colour with `--fs-text-strong` on a tint of `--fs-surface-raised`, so contrast follows the theme in both modes.
