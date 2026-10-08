/*
 * app-shell.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * app-shell behaviour: mega dropdowns (open/close, hover switching, filter,
 * keyboard), the left card menu for features with several pages, the phone
 * drawer and active states after partial navigation. See spec.md.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';

const norm = (p) => p.replace(/\/+$/, '') || '/';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Where does a path live in the navigation model? */
function locate(model, path) {
	path = norm(path);
	for (const a of model.areas) {
		if (a.href && norm(a.href) === path) return { area: a, item: null, page: null };
		for (const g of a.groups || []) for (const it of g.items) {
			if (it.pages) for (const p of it.pages) if (norm(p.href) === path) return { area: a, item: it, page: p };
			if (norm(it.href) === path) return { area: a, item: it, page: null };
		}
	}
	for (const o of model.other || []) if (norm(o.href) === path) return { area: null, item: o, page: null };
	return { area: null, item: null, page: null };
}

el.define('app-shell', {
	init(body) {
		const $app = $(body);
		const $menu = $app.find('.fs-pagemenu');
		const $drawer = $app.find('.fs-drawer');
		const $drawerBtn = $app.find('[data-fs-shell="drawer"]');
		const inner = $app.find('.fs-topbar-inner')[0];
		let model = { areas: [] };
		try { model = JSON.parse(document.getElementById('fs-nav')?.textContent || '{"areas":[]}'); } catch { /* keep empty */ }
		let at = locate(model, location.pathname);
		const ns = '.fsshell';

		/* ===================================================== mega menus */

		let openBtn = null;
		let closeTimer = null;

		function panelOf(btn) { return document.getElementById(btn.getAttribute('aria-controls')); }

		function place(btn, panel) {
			const box = inner.getBoundingClientRect();
			const b = btn.getBoundingClientRect();
			const width = panel.offsetWidth;
			const pad = parseFloat(getComputedStyle(inner).paddingLeft) || 0;
			let left = b.left - box.left - 8;
			left = Math.max(pad, Math.min(left, box.width - width - pad));
			panel.style.setProperty('--fs-mega-left', `${left}px`);
		}

		function open(btn, { focusFilter = true } = {}) {
			if (openBtn === btn) return;
			if (openBtn) close({ instant: true });
			clearTimeout(closeTimer);
			const panel = panelOf(btn);
			panel.hidden = false;
			place(btn, panel);
			btn.setAttribute('aria-expanded', 'true');
			openBtn = btn;
			requestAnimationFrame(() => panel.classList.add('is-open'));
			if (focusFilter) panel.querySelector('input')?.focus({ preventScroll: true });
		}

		function close({ instant = false, focus = false } = {}) {
			if (!openBtn) return;
			const btn = openBtn;
			const panel = panelOf(btn);
			openBtn = null;
			btn.setAttribute('aria-expanded', 'false');
			panel.classList.remove('is-open');
			const input = panel.querySelector('input');
			if (input && input.value) { input.value = ''; filter(panel, ''); }
			const hide = () => { if (btn !== openBtn) panel.hidden = true; };
			if (instant || reduced()) hide(); else closeTimer = setTimeout(hide, 180);
			if (focus) btn.focus();
		}

		function filter(panel, q) {
			q = q.trim().toLowerCase();
			let first = null, any = false;
			panel.querySelectorAll('.fs-mega-group').forEach((g) => {
				const groupMatch = q && g.querySelector('.fs-mega-group-title').textContent.toLowerCase().includes(q);
				let shown = 0;
				g.querySelectorAll('.fs-mega-link').forEach((a) => {
					const span = a.querySelector('span');
					const text = span.dataset.text || (span.dataset.text = span.textContent);
					const i = text.toLowerCase().indexOf(q);
					const hit = !q || groupMatch || i >= 0;
					a.parentElement.hidden = !hit;
					a.classList.remove('is-first');
					span.textContent = text;
					if (q && i >= 0) span.innerHTML = `${esc(text.slice(0, i))}<mark>${esc(text.slice(i, i + q.length))}</mark>${esc(text.slice(i + q.length))}`;
					if (hit) { shown++; if (!first) first = a; }
				});
				g.hidden = shown === 0;
				any = any || shown > 0;
			});
			if (q && first) first.classList.add('is-first');
			panel.querySelector('.fs-mega-empty').hidden = any;
			return first;
		}

		function visibleLinks(panel) { return [...panel.querySelectorAll('.fs-mega-link')].filter((a) => !a.parentElement.hidden && !a.closest('.fs-mega-group').hidden); }

		$app.on(`click${ns}`, 'button.fs-area', function () { if (openBtn === this) close(); else open(this, { focusFilter: true }); });
		/* menubar behaviour: while one menu is open, hovering another area switches to it */
		$app.on(`mouseenter${ns}`, 'button.fs-area', function () { if (openBtn && openBtn !== this && window.matchMedia('(hover: hover)').matches) open(this, { focusFilter: false }); });
		$app.on(`input${ns}`, '.fs-mega input', function () { filter(this.closest('.fs-mega'), this.value); });
		$app.on(`keydown${ns}`, '.fs-mega', function (e) {
			const links = visibleLinks(this);
			const i = links.indexOf(document.activeElement);
			if (e.key === 'Escape') { e.preventDefault(); close({ focus: true }); }
			else if (e.key === 'Enter' && e.target.matches('input')) { const f = this.querySelector('.fs-mega-link.is-first') || links[0]; if (f) { e.preventDefault(); f.click(); } }
			else if (e.key === 'ArrowDown') { e.preventDefault(); (links[i + 1] || links[0])?.focus(); }
			else if (e.key === 'ArrowUp') { e.preventDefault(); if (i <= 0) this.querySelector('input').focus(); else links[i - 1].focus(); }
		});
		$app.on(`keydown${ns}`, 'button.fs-area', function (e) {
			if (e.key === 'ArrowDown') { e.preventDefault(); open(this, { focusFilter: true }); }
			if (e.key === 'Escape') close({ focus: true });
		});
		$(document).on(`pointerdown${ns}`, (e) => { if (openBtn && !(e.target.closest && e.target.closest('.fs-area-wrap'))) close(); });
		$(document).on(`focusin${ns}`, (e) => { if (openBtn && !(e.target.closest && e.target.closest('.fs-area-wrap'))) close(); });
		$(window).on(`resize${ns}`, () => { if (openBtn) place(openBtn, panelOf(openBtn)); });

		/* ===================================================== card menu */

		function renderMenu(item, page) {
			const $head = $('<div class="fs-pagemenu-head">').append(
				$('<i aria-hidden="true">').addClass(`fa-solid fa-${item.icon}`),
				$('<h2 class="fs-pagemenu-title">').text(item.title));
			const $ul = $('<ul class="fs-pagemenu-list">');
			for (const p of item.pages) {
				const $a = $('<a class="fs-pagemenu-item" data-fs-nav>').attr('href', p.href)
					.append($('<i aria-hidden="true">').addClass(`fa-solid fa-${p.icon}`), $('<span>').text(p.title));
				if (p === page) $a.attr('aria-current', 'page');
				$ul.append($('<li>').append($a));
			}
			$menu.empty().append($head, $ul).attr('aria-label', item.title);
		}

		let hideTimer = null;
		function applyMenu(prev) {
			clearTimeout(hideTimer);
			const next = at.item && at.item.pages ? at.item : null;
			if (next) {
				const showing = $app.attr('data-fs-layout') === 'menu';
				if (prev !== next) {
					if (showing && !reduced()) {
						$menu.addClass('is-swapping');
						setTimeout(() => { renderMenu(next, at.page); $menu.removeClass('is-swapping'); }, 120);
					} else renderMenu(next, at.page);
				} else {
					$menu.find('.fs-pagemenu-item').each(function () {
						const on = norm(new URL(this.href, location.href).pathname) === norm(at.page ? at.page.href : at.item.href);
						$(this).attr('aria-current', on ? 'page' : null);
					});
				}
				$menu.prop('hidden', false);
				$app.attr('data-fs-layout', 'menu');
			} else {
				$app.attr('data-fs-layout', 'full');
				hideTimer = setTimeout(() => { if ($app.attr('data-fs-layout') === 'full') $menu.prop('hidden', true); }, reduced() ? 0 : 220);
			}
		}

		function markAreas() {
			$app.find('.fs-area').each(function () {
				const on = !!at.area && this.getAttribute('data-fs-area') === at.area.id;
				$(this).toggleClass('is-active', on);
				if (this.tagName === 'A') $(this).attr('aria-current', on ? 'page' : null);
			});
			$app.find('.fs-mega-link, .fs-drawer-link').each(function () {
				const on = !!at.item && norm(new URL(this.href, location.href).pathname) === norm(at.item.href);
				$(this).attr('aria-current', on ? 'page' : null);
			});
		}

		/* ========================================================= drawer */

		let lastFocus = null;
		function drawer(openIt) {
			$app.toggleClass('is-drawer-open', openIt);
			$drawerBtn.attr('aria-expanded', String(openIt));
			if (openIt) {
				lastFocus = document.activeElement;
				$drawer.prop('hidden', false).attr({ role: 'dialog', 'aria-modal': 'true' });
				requestAnimationFrame(() => { $drawer.addClass('is-open'); $drawer.find('button, a, summary').first().trigger('focus'); });
			} else {
				$drawer.removeClass('is-open');
				setTimeout(() => { if (!$app.hasClass('is-drawer-open')) $drawer.prop('hidden', true); }, reduced() ? 0 : 220);
				if (lastFocus) { lastFocus.focus(); lastFocus = null; }
			}
		}
		$app.on(`click${ns}`, '[data-fs-shell="drawer"]', () => drawer(!$app.hasClass('is-drawer-open')));
		$app.on(`click${ns}`, '[data-fs-shell="drawer-close"], .fs-scrim', () => drawer(false));
		$(document).on(`keydown${ns}`, (e) => {
			if (!$app.hasClass('is-drawer-open')) return;
			if (e.key === 'Escape') { drawer(false); return; }
			if (e.key === 'Tab') {
				const f = $drawer.find('a[href], button, summary').filter(':visible');
				if (!f.length) return;
				if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.last().trigger('focus'); }
				else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f.first().trigger('focus'); }
			}
		});

		/* ===================================================== navigation */

		$(document).on(`fs:navigated${ns}`, () => {
			close({ instant: true });
			if ($app.hasClass('is-drawer-open')) drawer(false);
			const prev = at.item && at.item.pages ? at.item : null;
			at = locate(model, location.pathname);
			markAreas();
			applyMenu(prev);
		});

		markAreas();
		return {
			destroy() { $app.off(ns); $(document).off(ns); $(window).off(ns); },
			open, close, drawer
		};
	}
});
