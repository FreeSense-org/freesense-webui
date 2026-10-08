#!/usr/bin/env node
/*
 * check.mjs
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * check.mjs — validate theme files: scheme compatibility, schema, contrast.
 *   node tools/theme/check.mjs [file.theme.json...] [--scheme 2.0]
 * Without files, checks every packages/theme-NAME/*.theme.json.
 * Exits 1 when any theme fails. Used by CI and by `npm run check:themes`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkTheme, SUPPORTED_SCHEME } from './lib.mjs';

const args = process.argv.slice(2);
const si = args.indexOf('--scheme');
const supported = si >= 0 ? args.splice(si, 2)[1] : SUPPORTED_SCHEME;
if (!args.length) {
	const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
	for (const d of readdirSync(join(root, 'packages')).filter((n) => n.startsWith('theme-')).sort()) {
		for (const f of readdirSync(join(root, 'packages', d)).filter((n) => n.endsWith('.theme.json'))) args.push(relative(process.cwd(), join(root, 'packages', d, f)));
	}
}
let failed = 0;

for (const file of args) {
	let theme;
	try { theme = JSON.parse(readFileSync(file, 'utf8')); } catch (e) {
		console.error(`FAIL ${file}\n  not valid JSON: ${e.message}`);
		failed++;
		continue;
	}
	const r = checkTheme(theme, supported);
	if (r.ok) console.log(`ok   ${file} (${theme.title} ${theme.version}, scheme ${theme.scheme}, ${Object.keys(theme.accents).length} accents)`);
	else {
		failed++;
		console.error(`FAIL ${file}\n  ${r.errors.join('\n  ')}`);
	}
}
if (!args.length) { console.error('check: no theme files found'); process.exit(2); }
process.exit(failed ? 1 : 0);
