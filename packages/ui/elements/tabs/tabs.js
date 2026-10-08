/*
 * tabs.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * tabs — in-page tabs (not navigation between pages; that is the card menu).
 * Tabs that do not fit move into a "More" menu; the active tab always stays
 * visible. Arrow keys move between tabs. Each tab's nested content renders
 * the first time the tab is shown. Optionally synced with ?tab=<id>.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { t, icon, emit, menuItems, disposeMenus } from '../page-header/actions.js';
import { renderContent } from '../card/nest.js';

let seq = 0;

el.define('tabs', {
	init(node, config) {
		const uid = `fs-tabs-${++seq}`;
		const tabs = (config.tabs || []).filter((tb) => tb && tb.id);
		const param = config.query === true ? 'tab' : (config.query || null);
		const $node = $(node).addClass('fs-tabs').empty();
		const $bar = $('<div class="fs-tabs-bar">');
		const $list = $('<div class="fs-tabs-list" role="tablist">').attr('aria-label', config.label || t('Sections'));
		const $moreMenu = $('<ul class="dropdown-menu dropdown-menu-end fs-menu-list">');
		const $moreBtn = $('<button type="button" class="fs-tab fs-tabs-more-btn" data-bs-toggle="dropdown" aria-expanded="false">')
			.append($('<span>').text(t('More')), icon('chevron-down'));
		const $more = $('<div class="dropdown fs-tabs-more" hidden>').append($moreBtn, $moreMenu);
		const $panels = $('<div class="fs-tabs-panels">');
		const byId = new Map();
		let current = null;

		for (const tb of tabs) {
			const $tab = $('<button type="button" class="fs-tab" role="tab" tabindex="-1" aria-selected="false">')
				.attr({ id: `${uid}-tab-${tb.id}`, 'aria-controls': `${uid}-panel-${tb.id}`, 'data-tab': tb.id });
			if (tb.icon) $tab.append(icon(tb.icon));
			$tab.append($('<span class="fs-tab-label">').text(tb.label || tb.id));
			const $badge = $('<span class="fs-tab-badge">').prop('hidden', tb.badge == null || tb.badge === '').text(tb.badge ?? '');
			$tab.append($badge);
			if (tb.disabled) $tab.prop('disabled', true);
			$tab.on('click', () => show(tb.id, { focus: false }));
			const $panel = $('<div class="fs-tabs-panel" role="tabpanel" tabindex="0" hidden>')
				.attr({ id: `${uid}-panel-${tb.id}`, 'aria-labelledby': `${uid}-tab-${tb.id}` });
			$list.append($tab);
			$panels.append($panel);
			byId.set(tb.id, { tb, $tab, $panel, $badge, rendered: false });
		}
		$bar.append($list, $more);
		$node.append($bar, $panels);

		const visibleTabs = () => [...byId.values()].filter((r) => !r.$tab.prop('hidden') && !r.$tab.prop('disabled'));

		/* Fit the tabs into the bar; the rest go into the More menu. */
		function layout() {
			const recs = [...byId.values()];
			if (!recs.length) return;
			recs.forEach((r) => r.$tab.prop('hidden', false));
			$more.prop('hidden', true);
			const avail = $bar[0].clientWidth;
			if (!avail) return;
			const gap = parseFloat(getComputedStyle($list[0]).columnGap) || 0;
			const widths = recs.map((r) => r.$tab[0].offsetWidth + gap);
			const total = widths.reduce((a, b) => a + b, 0);
			if (total <= avail + gap) { $moreMenu.empty(); return; }
			$more.prop('hidden', false);
			const room = avail - $more[0].offsetWidth - gap;
			const ai = Math.max(0, recs.findIndex((r) => r.tb.id === current));
			const keep = new Set();
			let used = widths[ai];
			keep.add(ai);
			recs.forEach((r, i) => {
				if (i === ai) return;
				if (used + widths[i] <= room) { keep.add(i); used += widths[i]; } else used = Infinity;
			});
			const over = [];
			recs.forEach((r, i) => { if (!keep.has(i)) { r.$tab.prop('hidden', true); over.push(r.tb); } });
			$moreMenu.empty().append(menuItems(over.map((tb) => ({ id: tb.id, label: tb.badge != null && tb.badge !== '' ? `${tb.label} (${tb.badge})` : tb.label, icon: tb.icon, disabled: tb.disabled })),
				(a) => show(a.id, { focus: true })));
			$moreBtn.attr('aria-label', `${t('More')}: ${over.length}`);
		}

		function syncUrl(id) {
			if (!param || location.protocol === 'file:') return;
			const u = new URL(location.href);
			if (u.searchParams.get(param) === id) return;
			u.searchParams.set(param, id);
			history.replaceState(history.state, '', u);
		}

		function show(id, { focus = false, silent = false } = {}) {
			const rec = byId.get(id);
			if (!rec || rec.tb.disabled) return;
			const prev = current;
			current = id;
			for (const r of byId.values()) {
				const on = r === rec;
				r.$tab.toggleClass('is-active', on).attr({ 'aria-selected': on ? 'true' : 'false', tabindex: on ? '0' : '-1' });
				r.$panel.prop('hidden', !on);
			}
			if (!rec.rendered) { rec.rendered = true; renderContent(rec.$panel, rec.tb.content); }
			if (rec.$tab.prop('hidden')) layout();
			if (focus) rec.$tab.trigger('focus');
			if (!silent && prev !== id) {
				syncUrl(id);
				emit(node, 'fs:tab', { id, el: 'tabs' });
			}
		}

		$list.on('keydown', (e) => {
			const vis = visibleTabs();
			const i = vis.findIndex((r) => r.$tab[0] === document.activeElement);
			if (i < 0) return;
			const next = { ArrowRight: vis[(i + 1) % vis.length], ArrowLeft: vis[(i - 1 + vis.length) % vis.length], Home: vis[0], End: vis[vis.length - 1] }[e.key];
			if (!next) return;
			e.preventDefault();
			show(next.tb.id, { focus: true });
		});

		const fromUrl = param ? new URLSearchParams(location.search).get(param) : null;
		const first = tabs.find((tb) => !tb.disabled);
		const start = [fromUrl, config.active].find((id) => id && byId.has(id) && !byId.get(id).tb.disabled) || (first && first.id);
		if (start) show(start, { silent: true });

		const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => layout()) : null;
		if (ro) ro.observe($bar[0]); else layout();

		return {
			/** Show a tab by id (renders its content on first show). */
			show: (id) => show(id),
			/** The active tab id. */
			active: () => current,
			/** Set or clear (null) a tab's count badge. */
			setBadge(id, n) {
				const r = byId.get(id);
				if (!r) return;
				r.tb.badge = n;
				r.$badge.text(n ?? '').prop('hidden', n == null || n === '');
				layout();
			},
			/** The panel of a tab (jQuery), e.g. to reach nested elements. */
			panel: (id) => (byId.get(id) || {}).$panel,
			destroy() { if (ro) ro.disconnect(); disposeMenus(node); }
		};
	}
});
