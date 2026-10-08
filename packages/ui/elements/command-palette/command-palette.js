/*
 * command-palette.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * command-palette — Ctrl+K (or '/', or the top-bar search button) opens a
 * dialog that searches the navigation model (areas → groups → items → pages)
 * and quick actions, with fuzzy matching, highlighted matches, keyboard
 * control and recent items. Pages open through FS.nav.go. See spec.md.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { api } from '../../js/api.js';
import { nav } from '../../js/nav.js';
import { theme } from '../../js/theme.js';
import { t, icon, prefs, notify, apiPath } from '../avatar/identity.js';
import { signOut } from '../profile-menu/profile-menu.js';

const STORE = 'fs-palette-recent';
let hotkeyOwner = null;
let seq = 0;

/* ------------------------------------------------------------ the index */

/** Flatten the navigation model into searchable entries. */
export function indexModel(model) {
	const out = [];
	const seen = new Set();
	const add = (title, crumbs, ic, href) => {
		if (!href || !title) return;
		const id = `page:${href}|${title}`;
		if (seen.has(id)) return;
		seen.add(id);
		out.push({ id, kind: 'page', title, crumbs, icon: ic || 'file', href });
	};
	for (const a of (model && model.areas) || []) {
		if (a.href) add(a.title, [], a.icon, a.href);
		for (const g of a.groups || []) {
			for (const it of g.items || []) {
				add(it.title, [a.title, g.title], it.icon, it.href);
				for (const p of it.pages || []) {
					if (p.href === it.href && p.title === it.title) continue;
					add(p.title, [a.title, it.title], p.icon, p.href);
				}
			}
		}
	}
	for (const o of (model && model.other) || []) add(o.title, [], o.icon, o.href);
	return out;
}

/**
 * Score one query token against a text. Contiguous matches beat scattered
 * ones; matches at a word start beat matches inside a word.
 * Returns {score, idx: [positions]} or null.
 */
export function fuzzy(text, token) {
	const s = String(text).toLowerCase();
	const q = token.toLowerCase();
	if (!q) return { score: 0, idx: [] };
	const at = s.indexOf(q);
	if (at >= 0) {
		let wordAt = at;
		const re = new RegExp(`(^|[^a-z0-9])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
		const m = re.exec(s);
		if (m) wordAt = m.index + m[1].length;
		const start = m ? wordAt : at;
		const bonus = m ? (start === 0 ? 80 : 50) : 0;
		return { score: 100 + bonus - Math.min(start, 30) + (q.length === s.length ? 40 : 0), idx: Array.from({ length: q.length }, (_, i) => start + i) };
	}
	const idx = [];
	let from = 0;
	let gaps = 0;
	for (const ch of q) {
		if (ch === ' ') continue;
		/* prefer the next word start that has this letter, then any position */
		let p = -1;
		for (let i = from; i < s.length; i++) {
			if (s[i] === ch && (i === 0 || /[^a-z0-9]/.test(s[i - 1]))) { p = i; break; }
		}
		const plain = s.indexOf(ch, from);
		if (p < 0 || (plain >= 0 && idx.length && plain === idx[idx.length - 1] + 1)) p = plain;
		if (p < 0) return null;
		if (idx.length) gaps += p - idx[idx.length - 1] - 1;
		idx.push(p);
		from = p + 1;
	}
	return { score: Math.max(1, 60 - gaps * 3 - idx[0]), idx };
}

/** Match an entry against all query tokens; every token must hit the title or the breadcrumb. */
export function matchEntry(entry, query) {
	const tokens = query.trim().split(/\s+/).filter(Boolean);
	if (!tokens.length) return { score: 0, idx: [] };
	let score = 0;
	const idx = new Set();
	const hay = [...(entry.crumbs || []), ...(entry.keywords || [])].join(' ');
	let ok = true;
	for (const tok of tokens) {
		const m0 = fuzzy(entry.title, tok);
		const m = m0 && m0.score >= 35 ? m0 : null; /* scattered letters far apart are noise */
		const h = m ? null : fuzzy(hay, tok);
		if (!m && !(h && h.score >= 100)) { ok = false; break; }
		if (m) { score += m.score; m.idx.forEach((i) => idx.add(i)); } else score += Math.round(h.score / 4);
	}
	if (!ok) {
		/* "wgpe": the letters run across the breadcrumb into the title (WireGuard › Peers) */
		const full = `${hay} ${entry.title}`;
		const m = fuzzy(full, tokens.join(''));
		if (!m || m.score < 20) return null;
		const off = hay.length + 1;
		score = Math.round(m.score / 3);
		m.idx.filter((i) => i >= off).forEach((i) => idx.add(i - off));
	}
	if (entry.kind === 'action') score -= 5;
	return { score, idx: [...idx].sort((a, b) => a - b) };
}

/** Title text with <mark> around matched characters, built from text nodes. */
function highlighted(text, idx) {
	const $s = $('<span class="fs-command-palette-title">');
	if (!idx || !idx.length) return $s.text(text);
	const on = new Set(idx);
	let run = '';
	let marked = false;
	const flush = () => {
		if (!run) return;
		$s.append(marked ? $('<mark>').text(run) : document.createTextNode(run));
		run = '';
	};
	for (let i = 0; i < text.length; i++) {
		const m = on.has(i);
		if (m !== marked) { flush(); marked = m; }
		run += text[i];
	}
	flush();
	return $s;
}

function readRecent() {
	try { const v = JSON.parse(localStorage.getItem(STORE) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function writeRecent(list) {
	try { localStorage.setItem(STORE, JSON.stringify(list)); } catch { /* storage unavailable: recent items are a convenience */ }
}

function editable(t0) {
	return !!(t0 && t0.closest && t0.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
}

/* ------------------------------------------------------------- element */

el.define('command-palette', {
	init(node, config) {
		const c = {
			trigger: 'search',
			hotkeys: true,
			inline: false,
			actions: ['mode', 'apply', 'signout'],
			apply: { path: '/v1/firewall/apply' },
			signOut: {},
			recent: 5,
			limit: 12,
			query: '',
			...config
		};
		const uid = `fs-cp-${++seq}`;
		const ns = `.fscp${seq}`;
		const $node = $(node).addClass('fs-command-palette').empty();

		function model() {
			if (c.nav) return c.nav;
			try { return JSON.parse(document.querySelector(c.navSource || '#fs-nav')?.textContent || '{}'); } catch { return {}; }
		}
		let pages = indexModel(model());

		const ACTIONS = {
			mode: () => ({
				id: 'action:mode', kind: 'action', icon: 'circle-half-stroke', crumbs: [t('Appearance')], keywords: ['dark', 'light', 'theme', 'mode'],
				title: theme.resolved() === 'dark' ? t('Switch to light mode') : t('Switch to dark mode'),
				run: () => prefs.save({ mode: theme.resolved() === 'dark' ? 'light' : 'dark' }).catch(() => {})
			}),
			apply: () => ({
				id: 'action:apply', kind: 'action', icon: 'check-double', crumbs: [t('Changes')], keywords: ['pending', 'reload', 'firewall'],
				title: t('Apply pending changes'),
				run: () => api.post(apiPath(c.apply.path)).then((r) => notify('ok', (r.meta && r.meta.message) || t('Changes applied')),
					(e) => notify('error', t('Could not apply the changes: {msg}', { msg: e.message })))
			}),
			signout: () => ({
				id: 'action:signout', kind: 'action', icon: 'right-from-bracket', crumbs: [t('Account')], keywords: ['logout', 'log out', 'exit'],
				title: t('Sign out'),
				run: () => signOut(c.signOut)
			})
		};
		const actions = () => (c.actions === false ? [] : (Array.isArray(c.actions) ? c.actions : Object.keys(ACTIONS))).filter((k) => ACTIONS[k]).map((k) => ACTIONS[k]());

		/* ------------------------------------------------------ the panel */
		const $input = $('<input type="text" class="fs-command-palette-input" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="true">')
			.attr({ 'aria-controls': `${uid}-list`, placeholder: c.placeholder || t('Search pages, settings and actions…'), 'aria-label': t('Search pages, settings and actions') });
		const $list = $('<ul class="fs-command-palette-list" role="listbox">').attr({ id: `${uid}-list`, 'aria-label': t('Results') });
		const $status = $('<p class="visually-hidden" role="status" aria-live="polite">');
		const $foot = $('<div class="fs-command-palette-foot" aria-hidden="true">').append(
			$('<span>').append($('<kbd>').text('↑'), $('<kbd>').text('↓'), document.createTextNode(` ${t('to move')}`)),
			$('<span>').append($('<kbd>').text('Enter'), document.createTextNode(` ${t('to open')}`)),
			c.inline ? null : $('<span>').append($('<kbd>').text('Esc'), document.createTextNode(` ${t('to close')}`)));
		const $panel = $('<div class="fs-command-palette-panel">').append(
			$('<div class="fs-command-palette-search">').append(icon('magnifying-glass'), $input),
			$list, $status, $foot);

		let $dialog = null;
		let $trigger = null;
		if (c.inline) {
			$node.addClass('is-inline').append($panel);
		} else {
			$dialog = $('<dialog class="fs-command-palette-dialog">').attr('aria-label', t('Command palette')).append($panel);
			$node.append($dialog);
			if (c.trigger === 'search') {
				$trigger = $('<button type="button" class="fs-command-palette-trigger">')
					.attr('aria-label', t('Search pages and settings (Ctrl+K)'))
					.append(icon('magnifying-glass'), $('<span>').text(t('Search')), $('<kbd>').text('Ctrl K'));
			} else if (c.trigger === 'icon') {
				$trigger = $('<button type="button" class="fs-idbtn fs-command-palette-trigger-icon">')
					.attr({ 'aria-label': t('Search pages and settings (Ctrl+K)'), title: t('Search (Ctrl+K)') })
					.append(icon('magnifying-glass'));
			}
			if ($trigger) $node.prepend($trigger.attr({ 'aria-haspopup': 'dialog' }).on('click', () => open()));
		}

		/* ---------------------------------------------------- results */
		let results = [];
		let active = 0;

		function row(entry, m, i) {
			const $li = $('<li class="fs-command-palette-item" role="option">').attr({ id: `${uid}-o${i}`, 'data-index': i, 'data-kind': entry.kind, 'aria-selected': 'false' });
			const $text = $('<span class="fs-command-palette-text">').append(highlighted(entry.title, m && m.idx));
			if (entry.crumbs && entry.crumbs.length) $text.append($('<span class="fs-command-palette-crumbs">').text(entry.crumbs.join(' › ')));
			$li.append($('<span class="fs-command-palette-icon">').append(icon(entry.icon)), $text,
				$('<span class="fs-command-palette-kind">').text(entry.kind === 'action' ? t('Action') : t('Page')));
			return $li;
		}

		function group(title) { return $('<li class="fs-command-palette-group" role="presentation">').text(title); }

		function render() {
			const q = $input.val();
			$list.empty();
			results = [];
			const acts = actions();
			if (!q.trim()) {
				const all = [...pages, ...acts];
				const recent = readRecent().map((id) => all.find((e) => e.id === id)).filter(Boolean).slice(0, c.recent);
				if (recent.length) {
					$list.append(group(t('Recent')));
					recent.forEach((e) => { $list.append(row(e, null, results.length)); results.push(e); });
				}
				const rest = acts.filter((a) => !recent.includes(a));
				if (rest.length) {
					$list.append(group(t('Quick actions')));
					rest.forEach((e) => { $list.append(row(e, null, results.length)); results.push(e); });
				}
				if (!recent.length) {
					const top = pages.filter((p) => !p.crumbs.length || p.crumbs.length === 0).slice(0, 6);
					if (top.length) {
						$list.append(group(t('Go to')));
						top.forEach((e) => { $list.append(row(e, null, results.length)); results.push(e); });
					}
				}
			} else {
				const scored = [];
				for (const e of [...pages, ...acts]) {
					const m = matchEntry(e, q);
					if (m) scored.push([e, m]);
				}
				scored.sort((a, b) => b[1].score - a[1].score || a[0].title.length - b[0].title.length);
				const top = scored.slice(0, c.limit);
				if (top.length) $list.append(group(t('Results')));
				top.forEach(([e, m]) => { $list.append(row(e, m, results.length)); results.push(e); });
				if (!top.length) {
					$list.append($('<li class="fs-command-palette-empty" role="presentation">').append(
						icon('magnifying-glass'), $('<span>').text(t('Nothing matches "{q}"', { q: q.trim() }))));
				}
				$status.text(top.length ? t('{n} results', { n: top.length }) : t('No results'));
			}
			setActive(0);
		}

		function setActive(i) {
			const $items = $list.find('[role="option"]');
			if (!$items.length) { $input.removeAttr('aria-activedescendant'); active = -1; return; }
			active = (i + $items.length) % $items.length;
			$items.attr('aria-selected', 'false').removeClass('is-active');
			const $a = $items.eq(active).attr('aria-selected', 'true').addClass('is-active');
			$input.attr('aria-activedescendant', $a.attr('id'));
			const li = $a[0];
			if (li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
		}

		function run(i) {
			const e = results[i];
			if (!e) return;
			const recent = [e.id, ...readRecent().filter((x) => x !== e.id)].slice(0, 12);
			writeRecent(recent);
			close();
			if (e.kind === 'action') { e.run(); return; }
			if (document.querySelector('.fs-app [data-fs-main]') && location.protocol !== 'file:') nav.go(e.href);
			else location.href = e.href;
		}

		$input.on('input', render);
		$input.on('keydown', (e) => {
			if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
			else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
			else if (e.key === 'Home' && e.ctrlKey) { e.preventDefault(); setActive(0); }
			else if (e.key === 'End' && e.ctrlKey) { e.preventDefault(); setActive(-1); }
			else if (e.key === 'Enter') { e.preventDefault(); run(active); }
		});
		$list.on('mousemove', '[role="option"]', function () { const i = +this.getAttribute('data-index'); if (i !== active) setActive(i); });
		$list.on('click', '[role="option"]', function () { run(+this.getAttribute('data-index')); });

		/* ------------------------------------------------- open / close */
		let lastFocus = null;
		function open(query = '') {
			if (c.inline) { $input.trigger('focus'); return; }
			if ($dialog[0].open) { $input.trigger('focus').select(); return; }
			pages = indexModel(model());
			lastFocus = document.activeElement;
			$input.val(query);
			render();
			$dialog[0].showModal();
			$dialog.addClass('is-open');
			$input.trigger('focus');
		}
		function close() {
			if (c.inline || !$dialog[0].open) return;
			$dialog.removeClass('is-open');
			$dialog[0].close();
		}
		if ($dialog) {
			$dialog.on('close', () => {
				$dialog.removeClass('is-open');
				if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
				lastFocus = null;
			});
			$dialog.on('click', (e) => { if (e.target === $dialog[0]) close(); });
		}

		/* -------------------------------------------------------- hotkeys */
		const owns = c.hotkeys && !c.inline && !hotkeyOwner;
		if (owns) {
			hotkeyOwner = uid;
			$(document).on(`keydown${ns}`, (e) => {
				if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && String(e.key).toLowerCase() === 'k') {
					e.preventDefault();
					if ($dialog[0].open) close(); else open();
				} else if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !editable(e.target) && !$dialog[0].open) {
					e.preventDefault();
					open();
				}
			});
			$(document).on(`click${ns}`, '[data-fs-palette]', (e) => { e.preventDefault(); open(); });
		}

		$(document).on(`fs:theme${ns}`, () => { if (c.inline || ($dialog && $dialog[0].open)) render(); });
		$input.val(c.query || '');
		render();

		return {
			open, close,
			/** Swap the navigation model (e.g. after a package install). */
			setModel(m) { c.nav = m; pages = indexModel(m); render(); },
			destroy() {
				$(document).off(ns);
				if (hotkeyOwner === uid) hotkeyOwner = null;
				if ($dialog && $dialog[0].open) $dialog[0].close();
			}
		};
	}
});
