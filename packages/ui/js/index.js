/*
 * @freesense/ui runtime entry. Bundled by esbuild into dist/public/ui/fs-ui.js.
 *
 * Exposes window.FS (and jQuery as window.$ / window.jQuery for element code
 * and package plugins). Elements register themselves with FS.el.define() from
 * their own modules (packages/ui/elements/<name>/<name>.js), imported below
 * as they are added to the catalogue.
 */
import $ from 'jquery';
import * as bootstrap from 'bootstrap';
import { api } from './api.js';
import { batch } from './batch.js';
import { live } from './live.js';
import { el } from './el.js';
import { theme } from './theme.js';
import { fmt } from './fmt.js';

const pkg = { version: __FS_UI_VERSION__, themeScheme: __FS_THEME_SCHEME__ };

const FS = { version: pkg.version, themeScheme: pkg.themeScheme, api, batch, live, el, theme, fmt, bootstrap };

window.$ = window.jQuery = $;
window.bootstrap = bootstrap;
window.FS = FS;

$(() => el.start());

export default FS;
