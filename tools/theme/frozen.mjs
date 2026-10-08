#!/usr/bin/env node
/*
 * frozen.mjs — released theme schemes must never change (RULES R9).
 *
 * schema/released.json maps each released scheme to the sha256 of its schema
 * file, e.g. {"2.0": "ab12…"}. This check fails when:
 *   - a released scheme file is missing or its hash changed;
 *   - a schema file exists that is neither released nor the scheme this
 *     engine supports (the one draft being worked on);
 *   - the supported scheme is older than the newest released one.
 * A scheme is released by adding its hash to released.json (done at the
 * WebUI release that ships it, P6 for 2.0).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { SUPPORTED_SCHEME } from './lib.mjs';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'schema');
const released = JSON.parse(readFileSync(join(dir, 'released.json'), 'utf8'));
const errors = [];
const cmp = (a, b) => { const [x, y] = [a, b].map((v) => v.split('.').map(Number)); return x[0] - y[0] || x[1] - y[1]; };

for (const [v, hash] of Object.entries(released)) {
	const f = join(dir, `theme-${v}.schema.json`);
	if (!existsSync(f)) { errors.push(`released scheme ${v} is missing (${f})`); continue; }
	const actual = createHash('sha256').update(readFileSync(f)).digest('hex');
	if (actual !== hash) errors.push(`released scheme ${v} has changed. Released schemes are frozen: add a new minor scheme file instead.`);
}
for (const f of readdirSync(dir).filter((n) => /^theme-\d+\.\d+\.schema\.json$/.test(n))) {
	const v = f.slice(6, -12);
	if (!(v in released) && v !== SUPPORTED_SCHEME) errors.push(`${f} is neither released nor the supported draft scheme ${SUPPORTED_SCHEME}`);
}
if (!existsSync(join(dir, `theme-${SUPPORTED_SCHEME}.schema.json`))) errors.push(`no schema file for the supported scheme ${SUPPORTED_SCHEME}`);
const newest = Object.keys(released).sort(cmp).pop();
if (newest && cmp(SUPPORTED_SCHEME, newest) < 0) errors.push(`the engine supports scheme ${SUPPORTED_SCHEME}, older than the released ${newest}`);

if (errors.length) { console.error(errors.map((e) => `frozen: ${e}`).join('\n')); process.exit(1); }
console.log(`frozen: ok (released: ${Object.keys(released).join(', ') || 'none yet'}; supported: ${SUPPORTED_SCHEME}${SUPPORTED_SCHEME in released ? '' : ' (draft)'})`);
