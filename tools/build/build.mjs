#!/usr/bin/env node
/*
 * build.mjs — build dist/ (committed; the FreeSense-webui port does not build).
 *
 *   dist/public/ui/fs-ui.css        engine CSS (Bootstrap + bridge + elements), theme-agnostic
 *   dist/public/ui/fs-ui.js         runtime (jQuery 4 + Bootstrap 5 + FS)
 *   dist/public/ui/fonts/*.woff2    Inter, JetBrains Mono, Font Awesome Solid
 *   dist/public/ui/manifest.json    versions + sha256 of every file (cache busting)
 *   dist/public/themes/<name>/      theme.css + theme.json for every packages/theme-NAME/NAME.theme.json
 *
 * Output is deterministic: CI rebuilds and fails on any difference.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as sass from 'sass';
import { transform } from 'lightningcss';
import { build } from 'esbuild';
import { checkTheme, compileTheme, themeMeta } from '../theme/lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const nm = join(root, 'node_modules');
const pub = join(root, 'dist', 'public');
const uiOut = join(pub, 'ui');
const ui = JSON.parse(readFileSync(join(root, 'packages', 'ui', 'package.json'), 'utf8'));

/* Browsers with color-mix(), cascade layers and :has() (2023+). */
const targets = { chrome: 111 << 16, edge: 111 << 16, firefox: 113 << 16, safari: (16 << 16) | (4 << 8) };

const log = (msg) => console.log(`build: ${msg}`);
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

rmSync(join(root, 'dist'), { recursive: true, force: true });
mkdirSync(join(uiOut, 'fonts'), { recursive: true });

/* 1. Engine CSS */
const compiled = sass.compile(join(root, 'packages', 'ui', 'scss', 'index.scss'), {
	loadPaths: [nm],
	quietDeps: true,
	silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'if-function'],
	style: 'expanded'
});
const css = transform({ filename: 'fs-ui.css', code: Buffer.from(compiled.css), minify: true, targets }).code;
writeFileSync(join(uiOut, 'fs-ui.css'), css);
log(`fs-ui.css ${(css.length / 1024).toFixed(0)} KiB`);

/* 2. Runtime JS */
await build({
	entryPoints: [join(root, 'packages', 'ui', 'js', 'index.js')],
	outfile: join(uiOut, 'fs-ui.js'),
	bundle: true,
	format: 'iife',
	minify: true,
	target: ['chrome111', 'firefox113', 'safari16.4'],
	legalComments: 'eof',
	define: { __FS_UI_VERSION__: JSON.stringify(ui.version), __FS_THEME_SCHEME__: JSON.stringify(ui.freesense.themeScheme) },
	logLevel: 'warning'
});
log(`fs-ui.js ${(readFileSync(join(uiOut, 'fs-ui.js')).length / 1024).toFixed(0)} KiB`);

/* 3. Fonts (vendored from npm) */
const fonts = [
	[join(nm, '@fontsource-variable', 'inter', 'files'), /^inter-latin(-ext)?-wght-normal\.woff2$/],
	[join(nm, '@fontsource', 'jetbrains-mono', 'files'), /^jetbrains-mono-latin(-ext)?-(400|600)-normal\.woff2$/],
	[join(nm, '@fortawesome', 'fontawesome-free', 'webfonts'), /^fa-solid-900\.woff2$/]
];
for (const [dir, re] of fonts) {
	for (const f of readdirSync(dir).filter((n) => re.test(n))) copyFileSync(join(dir, f), join(uiOut, 'fonts', f));
}
log(`fonts ${readdirSync(join(uiOut, 'fonts')).length} files`);

/* 4. Themes */
const themes = [];
for (const pkg of readdirSync(join(root, 'packages')).filter((d) => d.startsWith('theme-')).sort()) {
	for (const file of readdirSync(join(root, 'packages', pkg)).filter((f) => f.endsWith('.theme.json'))) {
		const theme = JSON.parse(readFileSync(join(root, 'packages', pkg, file), 'utf8'));
		const r = checkTheme(theme);
		if (!r.ok) {
			console.error(`build: theme ${file} failed its checks:\n  ${r.errors.join('\n  ')}`);
			process.exit(1);
		}
		const out = join(pub, 'themes', theme.name);
		mkdirSync(out, { recursive: true });
		writeFileSync(join(out, 'theme.css'), transform({ filename: 'theme.css', code: Buffer.from(compileTheme(theme)), minify: true, targets }).code);
		writeFileSync(join(out, 'theme.json'), JSON.stringify(themeMeta(theme), null, '\t') + '\n');
		themes.push(theme.name);
	}
}
log(`themes ${themes.join(', ')}`);

/* 5. Manifest */
function walk(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]));
}
const files = Object.fromEntries(walk(pub).sort().map((f) => [relative(pub, f).split('\\').join('/'), sha(readFileSync(f))]));
writeFileSync(join(uiOut, 'manifest.json'), JSON.stringify({ name: ui.name, version: ui.version, themeScheme: ui.freesense.themeScheme, themes, files }, null, '\t') + '\n');
log(`manifest ${Object.keys(files).length} files, version ${ui.version}`);
if (!existsSync(join(pub, 'themes', 'freesense'))) { console.error('build: the core theme "freesense" is missing'); process.exit(1); }
