# field-address

An address as firewall rules use it: `any`, an IPv4/IPv6 host, a CIDR network, a host name, an alias or an interface network (`LAN net`, `WAN address`, `This Firewall`). It validates while you type and shows what it understood next to the input. Suggestions come from `/v1/firewall/aliases?q=` and the interfaces. `invert: true` adds a Not toggle; the value is then prefixed with `!`.

Schema type `address`. The [form](../form/spec.md) builds it from the
resource schema ([schema.md](../form/schema.md)); the element `field-address` renders
one field on its own (config = the field schema plus `value` and `error`).

## Config

| Option | Type | Default | Meaning |
|---|---|---|---|
| `name` | string | — | Value key (dots nest in a form) |
| `label` | string | — | Visible label above the input |
| `help` | string | — | Help text under the input |
| `required` | bool | `false` | Must not be empty |
| `value` / `default` | any | — | Initial value |
| `disabled` / `readonly` | bool | `false` | Disabled |
| `error` | string | — | Initial inline error (standalone element) |
| `width` | `full` \| `half` \| `third` \| `two-thirds` | `full` | Column span inside a form |
| `invert` | bool | `false` | Not toggle |
| `allow` | string[] | all | Accepted kinds: `any`, `iface`, `ip`, `network`, `alias`, `fqdn` |
| `aliasTypes` | string[] | `host`, `network`, `urltable` | Alias types suggested |
| `invalidMessage` | string | — | Message for unparseable input |

## Builder (PHP, P4)

```php
$ui->fieldAddress('source', gettext('Source'))->invert()->required();
```

## Instance API

`FS.el.get(node)` returns `{ get(), set(value), validate(), setError(message), setDisabled(bool), focus() }`.
`validate()` runs the same checks as the form and shows the inline error; it returns the error entries (empty when valid).

## Events

`fs:change` [value] on the node after every user edit (standalone element). Inside a form the form handles changes.

## Accessibility

The input is a combobox (`aria-autocomplete=list`, `aria-activedescendant`); ArrowDown opens suggestions, Enter picks, Escape closes. The kind badge is decorative; the Not toggle is a button with `aria-pressed`.
