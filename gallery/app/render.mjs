/*
 * render.mjs
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Gallery-only renderer for /gallery/app/*: fills shell.html from nav.json the
 * same way the PHP Shell will. The markup helpers here are mirrored by the JS
 * in app-shell.js (which re-renders the card menu after partial navigation).
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (p) => p.replace(/\/+$/, '') || '/';
const icon = (name) => `<i class="fa-solid fa-${esc(name)}" aria-hidden="true"></i>`;

/** Find where a path lives in the model: {area, item, page}. */
export function locate(nav, path) {
	path = norm(path);
	for (const a of nav.areas) {
		if (a.href && norm(a.href) === path) return { area: a, item: null, page: null };
		for (const g of a.groups || []) for (const it of g.items) {
			if (it.pages) for (const p of it.pages) if (norm(p.href) === path) return { area: a, item: it, page: p };
			if (norm(it.href) === path) return { area: a, item: it, page: null };
		}
	}
	for (const o of nav.other || []) if (norm(o.href) === path) return { area: null, item: o, page: null };
	return null;
}

function megaPanel(a, current) {
	const groups = a.groups.map((g) => `<section class="fs-mega-group"><h3 class="fs-mega-group-title">${icon(g.icon)}${esc(g.title)}</h3><ul>${g.items.map((it) =>
		`<li><a class="fs-mega-link" data-fs-nav href="${esc(it.href)}"${current && current.item === it ? ' aria-current="page"' : ''}>${icon(it.icon)}<span>${esc(it.title)}</span>${it.pages ? `<small>${it.pages.length} pages</small>` : ''}</a></li>`).join('')}</ul></section>`).join('');
	return `<div class="fs-mega" id="fs-mega-${esc(a.id)}" role="region" aria-label="${esc(a.title)}" hidden>
		<div class="fs-mega-head"><h2 class="fs-mega-title">${icon(a.icon)}${esc(a.title)}</h2>
		<label class="fs-mega-filter"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" placeholder="Filter ${esc(a.title)}…" aria-label="Filter ${esc(a.title)} pages" autocomplete="off"></label></div>
		<div class="fs-mega-body">${groups}</div><p class="fs-mega-empty" hidden>No ${esc(a.title)} pages match.</p></div>`;
}

export function renderAreas(nav, current) {
	return nav.areas.map((a) => {
		const on = current && current.area === a;
		if (!a.groups) return `<a class="fs-area${on ? ' is-active' : ''}" data-fs-nav data-fs-area="${esc(a.id)}" href="${esc(a.href)}"${on ? ' aria-current="page"' : ''}>${icon(a.icon)}<span>${esc(a.title)}</span></a>`;
		return `<div class="fs-area-wrap"><button type="button" class="fs-area${on ? ' is-active' : ''}" data-fs-area="${esc(a.id)}" aria-expanded="false" aria-controls="fs-mega-${esc(a.id)}">${icon(a.icon)}<span>${esc(a.title)}</span><i class="fa-solid fa-chevron-down fs-area-caret" aria-hidden="true"></i></button>${megaPanel(a, current)}</div>`;
	}).join('');
}

export function renderDrawer(nav, current) {
	return `<div class="fs-drawer-head"><span class="fs-brand-mark" aria-hidden="true">FS</span><strong>FreeSense</strong><button type="button" class="fs-tb-btn" data-fs-shell="drawer-close" aria-label="Close menu"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>` +
		nav.areas.map((a) => {
			if (!a.groups) return `<a class="fs-drawer-area" data-fs-nav href="${esc(a.href)}">${icon(a.icon)}<span>${esc(a.title)}</span></a>`;
			const open = current && current.area === a;
			return `<details class="fs-drawer-group"${open ? ' open' : ''}><summary class="fs-drawer-area">${icon(a.icon)}<span>${esc(a.title)}</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></summary>${a.groups.map((g) =>
				`<div class="fs-drawer-sub">${esc(g.title)}</div>${g.items.map((it) => `<a class="fs-drawer-link" data-fs-nav href="${esc(it.href)}"${current && current.item === it ? ' aria-current="page"' : ''}>${esc(it.title)}</a>`).join('')}`).join('')}</details>`;
		}).join('');
}

export function renderMenu(item, page) {
	if (!item || !item.pages) return '';
	return `<div class="fs-pagemenu-head">${icon(item.icon)}<h2 class="fs-pagemenu-title">${esc(item.title)}</h2></div><ul class="fs-pagemenu-list">${item.pages.map((p) =>
		`<li><a class="fs-pagemenu-item" data-fs-nav href="${esc(p.href)}"${p === page ? ' aria-current="page"' : ''}>${icon(p.icon)}<span>${esc(p.title)}</span></a></li>`).join('')}</ul>`;
}

export async function renderApp(urlPath) {
	const nav = JSON.parse(await readFile(join(here, 'nav.json'), 'utf8'));
	const shell = await readFile(join(here, 'shell.html'), 'utf8');
	const path = norm(urlPath) === '/gallery/app' ? '/gallery/app/' : urlPath;
	const at = locate(nav, path);
	if (!at) return null;
	const title = at.page ? at.page.title : at.item ? at.item.title : at.area.title;
	const layout = at.item && at.item.pages ? 'menu' : 'full';
	const rel = norm(urlPath).replace(/^\/gallery\/app\/?/, '') || 'dashboard';
	const pageFile = join(here, 'pages', `${rel}.html`);
	const crumbs = [at.area && at.area.title, at.item && at.page && at.item.title].filter(Boolean);
	const main = existsSync(pageFile)
		? await readFile(pageFile, 'utf8')
		: `<div class="fs-placeholder"><nav class="fs-crumbs" aria-label="Breadcrumb">${crumbs.map(esc).join(' <span aria-hidden="true">/</span> ')}</nav><h1>${esc(title)}</h1><p class="fs-muted">This page is not built yet. The shell, menus and partial navigation are live, so try moving around.</p></div>`;
	const values = {
		title: esc(title), area: esc(at.area ? at.area.id : ''), layout, page: esc(rel),
		areas: renderAreas(nav, at), drawer: renderDrawer(nav, at),
		menu: renderMenu(at.item, at.page), menuTitle: esc(at.item && at.item.pages ? at.item.title : ''),
		menuHidden: layout === 'menu' ? '' : ' hidden',
		main, nav: JSON.stringify(nav).replace(/</g, '\\u003c')
	};
	return shell.replace(/\{\{(\w+)\}\}/g, (_, k) => values[k] ?? '');
}
