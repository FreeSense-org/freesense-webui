# console

A monospace output panel for tool results (ping, traceroute, DNS lookup, a
command) and job logs. Lines are appended live from a cursor source or
through the API, ANSI escapes are stripped and every line is plain text.
Auto-scroll follows the end until the user scrolls up; a "Jump to end" button
brings it back. The `job` element uses it for its log.

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `title` | string | — | Title in the bar (also the label of the output) |
| `source` | `{path, query}` | — | Live source, polled with `?after=<last line>` until it is done |
| `every` | seconds | `1` | Poll interval (`0` = read once) |
| `lines` | `(string \| {text, level, n, t})[]` | — | Static lines |
| `maxLines` | number | `2000` | Oldest lines are dropped beyond this |
| `wrap` | bool | `false` | Start with wrapped lines (toggle in the bar) |
| `copy` | bool | `true` | Copy button (copies all visible lines) |
| `timestamps` | bool | `false` | Show each line's time (`t`) in a muted gutter |
| `height` | CSS length \| `auto` | `20rem` | Maximum height of the output |
| `placeholder` | string | `No output yet` | Text before any output |
| `status` | string | — | Initial status text in the bar |
| `bare` | bool | `false` | No bar (title, status, wrap, copy) |

**Source response** (`data`): an array of lines, a string, or an object with
`lines` / `log` (array) or `output` (string), plus `done: true` or a final
`state` (`succeeded`, `failed`, `done`, …). `meta.cursor` (or the highest
line `n`) is sent back as `?after=`. A line is a string or
`{n, text, level: 'error' | 'warn', t}`.

## Builder (PHP, P4)

```php
$ui->console(gettext('ping -c 5 one.one.one.one'))
   ->source('/v1/diagnostics/ping/' . $runId)->every(1)->maxLines(2000);

$ui->console('pfctl -sr')->lines($output)->wrap();
```

## Instance API

| Method | Effect |
|---|---|
| `append(textOrLines)` | Append a string (split on newlines) or line objects |
| `clear()` | Remove all output |
| `text()` | All visible output as plain text |
| `count()` | `{lines, dropped}` |
| `setSource(source)` | Clear and follow another source |
| `stop()` | Stop polling |
| `setStatus(text, kind)` | Status in the bar; `kind` `running` (pulsing dot), `done`, `error` |
| `placeholder(text)` | Show the placeholder again |

## Events

`fs:console-done [{lines}]` on the node when the source reports it is done.

## Accessibility

- The output is a focusable `role="log"` region with `aria-live="off"`: screen readers can read it without every new line being announced. The status in the bar is a `role="status"`.
- Error lines start with a visually hidden "Error:" and are bold, so the level is not colour only.
- Wrap is a toggle button (`aria-pressed`); copy reports success with a toast. Buttons are 40 px high on touch screens.
- The running dot stops pulsing under `prefers-reduced-motion`.
