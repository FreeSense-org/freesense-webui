# FreeSense WebUI 2.0

The web interface of [FreeSense](https://www.freesense.org), an open-source
FreeBSD-based firewall, rebuilt from scratch.

- **API-first.** Every page is a frame of elements that load and save their data
  through the FreeSense REST API (`/api/v1`). Nothing blocks while data loads.
- **One element library.** `@freesense/ui` contains every element a page may use.
  Its version is the contract: pages, themes and packages declare which version
  they work with.
- **Themes.** A theme is one JSON file (`<name>.theme.json`), validated by its
  versioned theme scheme (`schema/theme-2.0.schema.json`). Light and dark are mandatory. Users choose their own theme, mode, accent and density.
- **One shell.** A top menu, plus a left section menu that slides out on areas with
  sub-pages and slides away on full-width pages.
- **No legacy.** Nothing from the 1.x WebUI is reused, wrapped or shimmed.

> Status: **P1, toolchain.** The plan is in
> `freesense-project/planning/2026-10-08-webui-2.0-plan.md`. Nothing here ships yet.

## Repository layout

```
packages/ui/               @freesense/ui: engine, element library, runtime JS
packages/theme-freesense/  @freesense/theme-freesense: the default theme
packages/create-theme/     `npm create @freesense/theme` scaffold
app/                       PHP app: router, page specs, shell, menu registry
gallery/                   element gallery (fixtures + mock API)
tools/                     build, checks, inventory, plist helper
dist/                      build output, committed (the port does not build)
docs/                      architecture and the rules everyone follows
```

## Documents

| Document | What it covers |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the pieces fit: API, runtime, elements, shell, themes, packaging |
| [docs/RULES.md](docs/RULES.md) | The hard rules for pages, elements and themes (enforced in CI) |
| [docs/ELEMENTS.md](docs/ELEMENTS.md) | The element catalogue and the versioning contract |
| [docs/PAGES.md](docs/PAGES.md) | Page patterns: how a page is a few lines, not a template |
| [docs/THEMES.md](docs/THEMES.md) | Theme manifest, tokens, modes, accents, densities, distribution |
| [docs/NAVIGATION.md](docs/NAVIGATION.md) | Areas, section menus, page layouts |
| [docs/PACKAGES.md](docs/PACKAGES.md) | How optional packages get an API side and a UI side |
| [schema/theme-2.0.schema.json](schema/theme-2.0.schema.json) | Theme scheme 2.0: JSON Schema for `*.theme.json` files |
| [docs/PORTING.md](docs/PORTING.md) | How a 1.x page becomes a 2.0 page |
| [docs/inventory/](docs/inventory/) | The baseline inventory of every 1.x page (generated) |

## Related repositories

- `freesense`: backend, REST API, schema layer. The old 1.x WebUI lives there until the 2.0 cutover.
- `freesense-system-ports`: the `security/FreeSense-webui` port.
- `freesense-os-base`: build planning and source acquisition.
- `freesense-packages`: package pages, widgets and theme packages.

## License

Apache License 2.0. See [LICENSE](LICENSE).

## Development

```
npm ci --ignore-scripts   # Node 24; dependency install scripts are not needed
npm run build             # dist/ (commit the result)
npm test                  # unit tests
npm run check             # themes (scheme, schema, contrast), frozen schemes, inventory
npm run gallery           # http://localhost:8770/gallery/
```
