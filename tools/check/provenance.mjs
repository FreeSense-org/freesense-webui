#!/usr/bin/env node
/*
 * provenance.mjs
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 *
 * WebUI 2.0 is written from scratch by The FreeSense Project (RULES R13):
 *  - every source file carries the FreeSense copyright header;
 *  - no file mentions the project FreeSense descends from, or its former
 *    owners. Upstream notices belong only to files that contain upstream code,
 *    and this repository has none.
 *
 *   node tools/check/provenance.mjs          check (CI)
 *   node tools/check/provenance.mjs --fix    add missing headers
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fix = process.argv.includes('--fix');

/* Names assembled from parts so this file does not match its own check. */
const FORBIDDEN = [['pf', 'sense'], ['net', 'gate'], ['rubicon', ' communications'], ['electric', ' sheep'], ['bsd', ' perimeter'], ['m0n0', 'wall']]
	.map(([a, b]) => new RegExp(`${a}${b}`, 'i'));
const HEADER_EXT = /\.(js|mjs|cjs|scss|css|php)$/;
const SKIP = /^(dist\/|\.cache\/|node_modules\/|package-lock\.json$)/;
const MARK = 'Copyright (c) 2026 The FreeSense Project';

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
	.split('\n').filter(Boolean).filter((f) => !SKIP.test(f));

const errors = [];
let fixed = 0;
for (const f of files) {
	let text;
	try { text = readFileSync(join(root, f), 'utf8'); } catch { continue; }
	for (const re of FORBIDDEN) {
		const m = re.exec(text);
		if (m) {
			const line = text.slice(0, m.index).split('\n').length;
			errors.push(`${f}:${line}: mentions "${m[0]}" (RULES R13: WebUI 2.0 is FreeSense's own work)`);
		}
	}
	if (HEADER_EXT.test(f) && !text.includes(MARK)) {
		if (!fix) { errors.push(`${f}: missing the FreeSense copyright header`); continue; }
		const header = `/*\n * ${basename(f)}\n *\n * part of FreeSense WebUI (https://www.freesense.org)\n * ${MARK}\n * SPDX-License-Identifier: Apache-2.0\n */\n`;
		const shebang = text.startsWith('#!') ? text.slice(0, text.indexOf('\n') + 1) : '';
		const rest = shebang ? text.slice(shebang.length) : text;
		const php = rest.startsWith('<?php') ? '<?php\n' : '';
		writeFileSync(join(root, f), shebang + php + header + (php ? rest.slice(rest.indexOf('\n') + 1) : rest));
		fixed++;
	}
}
if (fixed) console.log(`provenance: added headers to ${fixed} files`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`provenance: ok (${files.length} files)`);
