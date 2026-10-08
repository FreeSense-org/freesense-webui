# grid

A responsive 12-column layout of nested elements. Each item spans a number of
columns per breakpoint; mobile first, a breakpoint without a value inherits the
one below it. Breakpoints match Bootstrap's: `sm` ≥ 576 px, `md` ≥ 768 px,
`lg` ≥ 992 px (viewport). Items in a row stretch to equal height.

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `items` | Item[] | `[]` | `{el, config, span}` child elements |
| `span` | Span | `12` | Default span for items without one |
| `gap` | `none` \| `sm` \| `md` \| `lg` | `md` | `0`, `--fs-gap / 2`, `--fs-gap`, `--fs-pad` |
| `align` | `stretch` \| `start` | `stretch` | `start` keeps each item at its own height |

**Span:** a number (1–12) for every width, or `{base, sm, md, lg}`.
`{ base: 12, sm: 6, lg: 3 }` = one per row on phones, two from 576 px, four from 992 px.

## Builder (PHP, P4)

```php
$ui->grid()->span(['base' => 12, 'sm' => 6, 'lg' => 3])
   ->add($ui->card('WAN')->icon('globe')->content($ui->status('ok', gettext('Online'))))
   ->add($ui->card('WAN2')->content($ui->status('warn', gettext('Packet loss'))), ['lg' => 6]);
```

## Instance API

| Method | Effect |
|---|---|
| `setItems(items)` | Replace all items |
| `add(item)` | Append one item; returns its element node (`FS.el.get(node)` works at once) |

## Events

None of its own; child events bubble through.

## Accessibility

Purely visual layout: DOM order is reading order on every width, so keep the
items in a sensible order. No ARIA roles.
