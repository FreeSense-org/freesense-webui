/*
 * port.mjs
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Point the FreeSense-webui port (freesense-system-ports) at a commit of this
 * repository:
 *
 *   npm run port -- --ports ../freesense-system-ports [--commit <sha>]
 *
 * The commit (default: origin/main) must be on GitHub. Writes GH_TAGNAME,
 * DISTVERSION and PORTREVISION in the Makefile, distinfo (from GitHub's
 * archive of that commit) and pkg-plist (from the commit's tree, by the same
 * rules as do-install and tools/webui_port_audit.py there).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const ports = opt('ports');
if (!ports) {
	console.error('usage: npm run port -- --ports <freesense-system-ports checkout> [--commit <sha>]');
	process.exit(2);
}
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const commit = git('rev-parse', '--verify', `${opt('commit') || 'origin/main'}^{commit}`);
const version = JSON.parse(git('show', `${commit}:package.json`)).version;

/* What do-install copies, as pkg-plist lines. */
const APP_FILES = ['bootstrap.php', 'nav.json', 'pages.php'];
const APP_DIRS = ['src/', 'pages/', 'templates/'];
export function plistOf(names) {
	const out = [];
	for (const n of names) {
		if (n === 'app/public/index.php') out.push('www-ui/index.php');
		else if (n.startsWith('dist/public/ui/') || n.startsWith('dist/public/themes/')) out.push('www-ui/' + n.slice('dist/public/'.length));
		else if (n.startsWith('app/') && (APP_FILES.includes(n.slice(4)) || APP_DIRS.some((d) => n.slice(4).startsWith(d)))) out.push('%%DATADIR%%/' + n);
		else if (n === 'LICENSE' || n === 'NOTICE') out.push('%%DATADIR%%/' + n);
	}
	return out.sort();
}

const names = git('ls-tree', '-r', '--name-only', commit).split('\n');
const plist = plistOf(names);

const dir = join(ports, 'security', 'FreeSense-webui');
const makefile = readFileSync(join(dir, 'Makefile'), 'utf8');
const field = (name) => (makefile.match(new RegExp(`^${name}=\\s*(.*)$`, 'm')) || [])[1]?.trim();
const sameVersion = field('DISTVERSION') === version;
const revision = sameVersion && field('GH_TAGNAME') !== commit ? Number(field('PORTREVISION') || 0) + 1 : sameVersion ? Number(field('PORTREVISION') || 0) : 0;
const set = (text, name, value) => text.replace(new RegExp(`^${name}=(\\s*).*$`, 'm'), `${name}=$1${value}`);
let next = set(makefile, 'GH_TAGNAME', commit);
next = set(next, 'DISTVERSION', version);
next = set(next, 'PORTREVISION', String(revision));

const url = `https://codeload.github.com/FreeSense-org/freesense-webui/tar.gz/${commit}`;
const res = await fetch(url);
if (!res.ok) {
	console.error(`port: ${url}: HTTP ${res.status} (is ${commit.slice(0, 12)} pushed to GitHub?)`);
	process.exit(1);
}
const archive = Buffer.from(await res.arrayBuffer());
const distfile = `FreeSense-org-freesense-webui-${commit}_GH0.tar.gz`;
const distinfo = `TIMESTAMP = ${Math.floor(Date.now() / 1000)}\nSHA256 (${distfile}) = ${createHash('sha256').update(archive).digest('hex')}\nSIZE (${distfile}) = ${archive.length}\n`;

writeFileSync(join(dir, 'Makefile'), next);
writeFileSync(join(dir, 'distinfo'), distinfo);
writeFileSync(join(dir, 'pkg-plist'), plist.join('\n') + '\n');
console.log(`port: FreeSense-webui ${version}_${revision} at ${commit.slice(0, 12)}, ${plist.length} files, archive ${archive.length} bytes`);
