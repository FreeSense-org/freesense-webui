#!/usr/bin/env node
/*
 * build-inventory.mjs — baseline inventory of the 1.x WebUI.
 *
 * Reads a freesense checkout (read-only) and records, for every 1.x page and
 * widget, what it is and what it does: privilege, title, includes, POST keys,
 * actions, AJAX handlers, forms, tabs. The output is the specification the 2.0
 * port is measured against (docs/PORTING.md) and the denominator of the
 * coverage gate that blocks the 2.0 cutover.
 *
 *   node tools/inventory/build-inventory.mjs [path-to-freesense] [--check]
 *
 * Default freesense path: ../freesense. Writes docs/inventory/pages.json and
 * docs/inventory/README.md; keeps docs/inventory/status.json entries and adds
 * new pages as "todo". With --check, exits 1 if the committed files are stale.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const args = process.argv.slice(2);
const check = args.includes('--check');
const src = resolve(args.find((a) => !a.startsWith('--')) || join(repo, '..', 'freesense'));
const www = join(src, 'src', 'usr', 'local', 'www');
const outDir = join(repo, 'docs', 'inventory');

if (!existsSync(www)) {
	console.error(`freesense WebUI not found at ${www}`);
	process.exit(2);
}

let baseline = 'unknown';
try {
	baseline = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch { /* not a git checkout */ }

/* Which files are pages: every *.php in www and its page subdirectories, minus
 * libraries and endpoints that are not pages. */
const SKIP_DIRS = new Set(['vendor', 'classes', 'csrf', 'includes', 'api', 'css', 'js', 'fonts', 'widgets']);
function listPages(dir, base = '') {
	const out = [];
	for (const name of readdirSync(dir).sort()) {
		const p = join(dir, name);
		const rel = base ? `${base}/${name}` : name;
		if (statSync(p).isDirectory()) {
			if (!SKIP_DIRS.has(name)) out.push(...listPages(p, rel));
		} else if (name.endsWith('.php')) {
			out.push(rel);
		}
	}
	return out;
}

const uniq = (a) => [...new Set(a)].sort();
const all = (re, s, g = 1) => uniq([...s.matchAll(re)].map((m) => m[g]));

function privBlocks(s) {
	const blocks = [];
	for (const m of s.matchAll(/##\|\+PRIV([\s\S]*?)##\|-PRIV/g)) {
		const b = {};
		for (const l of m[1].matchAll(/##\|\*(\w+)=(.*)/g)) {
			const k = l[1].toLowerCase();
			if (k === 'match') (b.match = b.match || []).push(l[2].trim());
			else b[k] = l[2].trim();
		}
		blocks.push(b);
	}
	return blocks;
}

function title(s) {
	const m = /\$pgtitle\s*=\s*(?:array\(|\[)([^;]*?)(?:\)|\])\s*;/.exec(s);
	if (!m) return null;
	const parts = [...m[1].matchAll(/gettext\(\s*["']([^"']+)["']\s*\)|["']([^"']+)["']|(\$\w+)/g)]
		.map((x) => x[1] || x[2] || x[3]);
	return parts.join(' › ');
}

function classify(rel, s) {
	if (/->widget\.php$|\.widget\.php$/.test(rel)) return 'widget';
	if (/\$_(?:REQUEST|POST|GET)\[['"]ajax['"]\]|isAjax\(\)/.test(s) && !/include\(["']head\.inc["']\)/.test(s)) return 'endpoint';
	if (/new Form\b|new Form_Section/.test(s)) {
		if (/\$_(?:GET|REQUEST)\[['"]id['"]\]/.test(s) && /_edit\.php$/.test(rel)) return 'editor';
		return 'form';
	}
	if (/fs_table_toolbar|<table/.test(s)) return /^status_|^diag_/.test(rel) ? 'status' : 'list';
	if (/include\(["']head\.inc["']\)/.test(s)) return 'page';
	return 'endpoint';
}

function inspect(rel, s) {
	const priv = privBlocks(s);
	return {
		file: rel,
		type: classify(rel, s),
		title: title(s),
		lines: s.split('\n').length,
		privileges: priv.map((p) => ({ ident: p.ident, name: p.name, match: p.match || [] })),
		shortcut: (/\$shortcut_section\s*=\s*["']([\w-]+)["']/.exec(s) || [])[1] || null,
		tabs: all(/fs_tabs\(\s*["']([\w-]+)["']/g, s),
		requires: all(/require(?:_once)?\(\s*["']([^"']+\.inc)["']\s*\)/g, s).filter((f) => f !== 'guiconfig.inc'),
		post_keys: all(/\$_POST\[\s*['"]([\w-]+)['"]\s*\]/g, s),
		get_keys: all(/\$_GET\[\s*['"]([\w-]+)['"]\s*\]/g, s),
		actions: uniq([
			...all(/\$_(?:POST|REQUEST|GET)\[['"]act['"]\]\s*==+\s*["']([\w-]+)["']/g, s),
			...all(/case\s+["']([\w-]+)["']\s*:/g, s).filter(() => /switch\s*\(\s*\$act\b/.test(s)),
			...all(/name=["']?(save|apply|del|delete|toggle|move|add|copy)\b/g, s)
		]),
		fields: uniq([...s.matchAll(/new Form_(Input|Select|Checkbox|Textarea|IpAddress|MultiCheckbox|StaticText|Button|SelectInputCombo)\(\s*['"]([\w[\]-]+)['"]/g)]
			.map((m) => `${m[2]}:${m[1].toLowerCase()}`)),
		forms: (s.match(/new Form\b/g) || []).length,
		sections: all(/new Form_Section\(\s*(?:gettext\()?\s*["']([^"']+)["']/g, s),
		ajax: /\$_(?:REQUEST|POST|GET)\[['"]ajax['"]\]|isAjax\(\)|\$\.ajax|\$\.post|\$\.get\(|fetch\(/.test(s),
		polling: /setInterval|setTimeout\([^,]+,\s*\d{3,}/.test(s),
		modals: (s.match(/fs_modal_form_begin|new Modal\(/g) || []).length,
		services: all(/(?:service_restart|services_\w+_configure|filter_configure|system_\w+_configure|interface_\w+_configure)\b/g, s, 0),
		legacy_markup: {
			inline_style: (s.match(/style=["']/g) || []).length,
			style_blocks: (s.match(/<style/g) || []).length,
			scripts: (s.match(/<script/g) || []).length
		}
	};
}

const pages = listPages(www).map((rel) => inspect(rel, readFileSync(join(www, rel), 'utf8')));
const widgetDir = join(www, 'widgets', 'widgets');
const widgets = existsSync(widgetDir)
	? readdirSync(widgetDir).filter((f) => f.endsWith('.php')).sort()
		.map((f) => inspect(`widgets/widgets/${f}`, readFileSync(join(widgetDir, f), 'utf8')))
		.map((w) => ({ ...w, type: 'widget' }))
	: [];

const inventory = {
	generated_from: { repo: 'freesense', commit: baseline, path: 'src/usr/local/www' },
	counts: {
		pages: pages.filter((p) => p.type !== 'endpoint').length,
		endpoints: pages.filter((p) => p.type === 'endpoint').length,
		widgets: widgets.length
	},
	pages,
	widgets
};

/* status.json: one entry per page/widget; keep existing decisions. */
const statusPath = join(outDir, 'status.json');
const oldStatus = existsSync(statusPath) ? JSON.parse(readFileSync(statusPath, 'utf8')) : {};
const status = {};
for (const p of [...pages, ...widgets]) {
	status[p.file] = oldStatus[p.file] || { state: p.type === 'endpoint' ? 'replaced-by-api' : 'todo', route: null, prs: [] };
}

const byType = {};
for (const p of [...pages, ...widgets]) byType[p.type] = (byType[p.type] || 0) + 1;
const states = {};
for (const k of Object.keys(status)) states[status[k].state] = (states[status[k].state] || 0) + 1;
const todo = Object.keys(status).length - (states.ported || 0) - (states.dropped || 0) - (states['replaced-by-api'] || 0);

const md = `# 1.x WebUI inventory

Generated by \`tools/inventory/build-inventory.mjs\` from \`freesense\` at
\`${baseline.slice(0, 12)}\`. Do not edit \`pages.json\` by hand: re-run the tool.
Port progress lives in \`status.json\` (\`todo\`, \`in-progress\`, \`ported\`,
\`dropped\`, \`replaced-by-api\`).

## Totals

| Type | Count |
|---|---|
${Object.keys(byType).sort().map((t) => `| ${t} | ${byType[t]} |`).join('\n')}

## Progress

| State | Count |
|---|---|
${Object.keys(states).sort().map((t) => `| ${t} | ${states[t]} |`).join('\n')}

Remaining before the 2.0 cutover: **${todo}**.

## Pages

| File | Type | Title | Privilege | Lines |
|---|---|---|---|---|
${[...pages, ...widgets].filter((p) => p.type !== 'endpoint').map((p) =>
	`| \`${p.file}\` | ${p.type} | ${(p.title || '').replace(/\|/g, '\\|')} | ${p.privileges.map((x) => x.ident).filter(Boolean).join(', ')} | ${p.lines} |`).join('\n')}

## Endpoints (replaced by API routes)

${pages.filter((p) => p.type === 'endpoint').map((p) => `- \`${p.file}\``).join('\n')}
`;

const outputs = {
	[join(outDir, 'pages.json')]: JSON.stringify(inventory, null, '\t') + '\n',
	[join(outDir, 'status.json')]: JSON.stringify(status, null, '\t') + '\n',
	[join(outDir, 'README.md')]: md
};

if (check) {
	const stale = Object.keys(outputs).filter((f) => !existsSync(f) || readFileSync(f, 'utf8') !== outputs[f]);
	if (stale.length) {
		console.error('Inventory is stale: ' + stale.map((f) => relative(repo, f)).join(', '));
		process.exit(1);
	}
	console.log('Inventory is up to date.');
} else {
	for (const [f, c] of Object.entries(outputs)) writeFileSync(f, c);
	console.log(`Wrote ${Object.keys(outputs).length} files: ${inventory.counts.pages} pages, ${inventory.counts.endpoints} endpoints, ${inventory.counts.widgets} widgets (baseline ${baseline.slice(0, 12)}).`);
}
