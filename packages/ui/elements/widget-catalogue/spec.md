# widget-catalogue

The list of every registered widget type (`FS.widgets`, see
`dashboard/widgets.md`), grouped by category in catalogue order, with a search
field, each type's icon preview, description, a "New" badge and how many
copies are already on the dashboard. Types that allow one copy only are
disabled once they are on the dashboard.

The dashboard opens it in a drawer (Add widget). Picking a widget closes the
drawer, and the dashboard appends the widget, scrolls to it and focuses it.

## Programmatic API

```js
import { openCatalogue, catalogueNode } from '../widget-catalogue/widget-catalogue.js';
openCatalogue({ counts: { traffic: 1 }, onAdd: (type) => dash.add(type) });   // drawer
const cat = catalogueNode({ counts, onAdd, types, compact });                  // inline: {$root, setCounts, filter, focusSearch}
```

## Config (element)

| Option | Type | Default | Meaning |
|---|---|---|---|
| `inline` | bool | `false` | Render the list in place; otherwise a button that opens the drawer |
| `for` | id | — | Id of a dashboard element: counts come from it and Add calls its `add()` |
| `counts` | `{type: n}` | — | Counts when there is no `for` |
| `types` | string[] | all | Limit the list to these types |
| `compact` | bool | `false` | Hide the descriptions |
| `query` | string | — | Start with this search (inline) |
| `label`, `variant`, `size` | | `Add widget`, `secondary` | The trigger button |

## Builder (PHP, P4)

```php
$ui->widgetCatalogue()->for('dashboard')->label(gettext('Add widget'));
$ui->widgetCatalogue()->inline()->types(['traffic', 'gateways']);
```

## Instance API

`FS.el.get(node)`: `open()` (drawer), `setCounts(counts)` (inline).

## Events

`fs:widget-add [{type}]` on the node when a widget is picked.

## Accessibility

- The search field has a label and controls the list; the number of matches is announced politely.
  Enter in the search moves focus to the first Add button.
- Each category is a `section` labelled by its heading; items are a list.
- Add buttons are described by the widget title ("Add" + "Traffic"); disabled ones explain why in a tooltip.
- The "on the dashboard" count is text with a check icon, not colour only.
- In the drawer, focus starts in the search field; Escape closes and returns focus to the opener.
