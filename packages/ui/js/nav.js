/*
 * nav.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * FS.nav — partial navigation.
 *
 * Links marked data-fs-nav (the shell marks all of its own) are fetched with
 * $.ajax. The new page's [data-fs-main] replaces the current one, <title>
 * updates, and history.pushState keeps Back/Forward and deep links working.
 * The top bar never reloads. The shell listens to 'fs:navigated' to move or
 * slide the section menu.
 *
 * Before the swap: 'fs:unload' fires and page-scoped live tasks are cleared;
 * elements in the old main are destroyed by the FS.el MutationObserver.
 * Any failure falls back to a normal page load.
 */
import $ from 'jquery';
import { live } from './live.js';

let busy = null;

function mainInfo(node) {
	return {
		page: node.getAttribute('data-fs-page') || '',
		area: node.getAttribute('data-fs-area') || '',
		layout: node.getAttribute('data-fs-layout') || 'section'
	};
}

function go(href, { push = true } = {}) {
	if (busy) busy.abort();
	const $app = $('.fs-app').addClass('is-navigating');
	busy = $.ajax({ url: href, dataType: 'html', timeout: 15000, headers: { 'X-FS-Partial': '1' } })
		.done((html) => {
			const doc = new DOMParser().parseFromString(html, 'text/html');
			const next = doc.querySelector('[data-fs-main]');
			if (!next) { location.href = href; return; }
			$(document).trigger('fs:unload');
			live.clear('page');
			const current = document.querySelector('[data-fs-main]');
			const imported = document.importNode(next, true);
			current.replaceWith(imported);
			document.title = doc.title;
			if (push) history.pushState({ fsNav: true }, '', href);
			const info = mainInfo(imported);
			$(document).trigger('fs:navigated', [info]);
			const h1 = imported.querySelector('h1');
			if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
			window.scrollTo(0, 0);
		})
		.fail((xhr, status) => { if (status !== 'abort') location.href = href; })
		.always(() => { busy = null; $app.removeClass('is-navigating'); });
}

function sameOrigin(a) {
	return a.origin === location.origin && !a.hasAttribute('download') && a.target !== '_blank';
}

$(document).on('click', 'a[data-fs-nav]', function (e) {
	if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
	if (!sameOrigin(this) || location.protocol === 'file:') return;
	if (this.pathname === location.pathname && this.search === location.search && this.hash) return;
	e.preventDefault();
	go(this.href);
});

window.addEventListener('popstate', (e) => { if (e.state && e.state.fsNav) go(location.href, { push: false }); });
if (location.protocol !== 'file:') history.replaceState({ fsNav: true }, '', location.href);

export const nav = {
	go,
	current() { const m = document.querySelector('[data-fs-main]'); return m ? mainInfo(m) : null; }
};
