# Porting a 1.x page

A 1.x page is a **specification**, not a source to copy (RULES R10). Porting
means understanding everything the old page does, moving the logic behind the API,
and designing the new page from catalogue elements.

## Checklist

1. **Inventory.** Open the page's entry in `docs/inventory/pages.json` and read the old page. Record in the port PR:
   - every action (buttons, POST `act` values, row actions, AJAX calls);
   - every field with its validation and dependencies (show/hide rules);
   - the privilege(s) and the side effects (services restarted, filter reloads, files written);
   - the messages and confirmations the user sees.
2. **Backend (freesense).**
   - Move any logic still inside the page into a shared `.inc` service. Most areas already have one from the REST API work.
   - Add or extend the API routes and the resource schema, with keyed validation errors.
   - Add tests in `tests/RestApiSmokeTest.php`.
3. **Design.**
   - Place the page in the navigation map: area, section group, `LAYOUT`.
   - Sketch it from catalogue elements. If something is missing, open an element PR first (spec, fixtures, gallery, tests).
4. **Page spec (this repo).** Write `app/pages/<area>/<Page>.php`:
   - `ROUTE`, `PRIV` (the existing privilege id), `AREA`, `LAYOUT`, `TITLE`;
   - `build(Ui $ui)` using elements only.
5. **Privileges.** Add the page to the privileges export so the backend `priv.defs.inc` matches the new route.
6. **Tests.**
   - A page-spec unit test (renders, has no raw HTML, required elements present).
   - A Playwright flow against the gallery mock API.
   - Visual check in both modes.
7. **Parity on the VM.**
   - Run the old and new page side by side on the test VM (`test-lab/vmware/freesense-test`).
   - Do every recorded action in both and compare the resulting `config.xml` diff and services state.
8. **Mark done** in `docs/inventory/status.json` (`ported`, PR links). The coverage report must not regress.

## Definition of done

- [ ] Every inventory item exists in the new page or is listed as intentionally dropped, with a reason accepted in review.
- [ ] Only catalogue elements; no RULES violations (CI green).
- [ ] Loading, empty, error and stale states visible in the gallery or e2e screenshots.
- [ ] Works with keyboard only, at 375 px, in light and dark.
- [ ] Parity verified on the VM.
