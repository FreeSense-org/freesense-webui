/*
 * widget-catalogue.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * widget-catalogue — every registered widget type, grouped by category, with
 * search, description, a "New" badge, an icon preview and how many copies are
 * already on the dashboard. The dashboard opens it in a drawer:
 *
 *   import { openCatalogue } from '../widget-catalogue/widget-catalogue.js';
 *   openCatalogue({ counts: { traffic: 1 }, onAdd: (type) => dash.add(type) });
 *
 * As an element it renders the list inline (gallery, docs) or as a trigger
 * button that opens the drawer, and emits `fs:widget-add` [{type}] on its node.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { t } from '../../js/i18n.js';
import { icon } from '../toast/toast.js';
import { drawer } from '../drawer/drawer.js';
import { badgeNode } from '../badge/badge.js';
import { widgets } from '../dashboard/registry.js';

let seq = 0;

/** Fold accents and case so "Gateways" matches "gateway". */
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Build the catalogue list. Returns { $root, focusSearch(), setCounts(counts) }.
 *   counts: {type: n}   onAdd(type)   types: optional subset (array of types)
 */
export function catalogueNode({ counts = {}, onAdd = null, types = null, compact = false } = {}) {
	const id = `fs-wcat-${++seq}`;
	const $root = $('<div class="fs-wcat">').toggleClass('is-compact', !!compact);
	const $search = $('<input type="search" class="form-control fs-wcat-search" autocomplete="off">')
		.attr({ id: `${id}-q`, placeholder: t('Search widgets'), 'aria-label': t('Search widgets'), 'aria-controls': `${id}-list` });
	const $searchWrap = $('<div class="fs-wcat-searchwrap">').append(icon('magnifying-glass').addClass('fs-wcat-search-icon'), $search);
	const $count = $('<p class="fs-wcat-count visually-hidden" role="status" aria-live="polite">');
	const $list = $('<div class="fs-wcat-list">').attr('id', `${id}-list`);
	const $none = $('<div class="fs-wcat-none" hidden>').append(
		$('<span class="fs-wcat-none-icon">').append(icon('magnifying-glass')),
		$('<p class="fs-wcat-none-title">'),
		$('<p class="fs-wcat-none-text">').text(t('Try another word, such as traffic, VPN or logs.')));
	$root.append($searchWrap, $count, $list, $none);

	const defs = widgets.list().filter((d) => !types || types.includes(d.type));
	const items = [];
	let current = { ...counts };

	for (const cat of [...new Set(defs.map((d) => d.category))]) {
		const gid = `${id}-${norm(cat).replace(/[^a-z0-9]+/g, '-')}`;
		const $group = $('<section class="fs-wcat-group">').attr('aria-labelledby', gid);
		$group.append($('<h3 class="fs-wcat-group-title">').attr('id', gid).text(t(cat)));
		const $ul = $('<ul class="fs-wcat-items" role="list">');
		for (const d of defs.filter((x) => x.category === cat)) {
			const $li = $('<li class="fs-wcat-item">').attr('data-type', d.type);
			const titleId = `${id}-${d.type}`;
			const $title = $('<p class="fs-wcat-title">').attr('id', titleId).append($('<span>').text(t(d.title)));
			if (d.isNew) $title.append(badgeNode({ label: t('New'), tone: 'accent' }));
			const $on = $('<span class="fs-wcat-on">');
			const $btn = $('<button type="button" class="btn btn-secondary btn-sm fs-action fs-wcat-add">')
				.attr('aria-describedby', titleId)
				.append(icon('plus'), $('<span>').text(t('Add')))
				.on('click', () => { if (onAdd) onAdd(d.type); });
			$li.append(
				$('<span class="fs-wcat-preview" aria-hidden="true">').append(icon(d.icon)),
				$('<div class="fs-wcat-text">').append($title, d.description ? $('<p class="fs-wcat-desc">').text(t(d.description)) : null, $on),
				$btn);
			$ul.append($li);
			items.push({ d, $li, $on, $btn, $group, hay: norm([d.title, t(d.title), d.description, t(d.description), d.category, t(d.category), d.type, ...(d.keywords || [])].join(' ')) });
		}
		$list.append($group.append($ul));
	}

	function setCounts(next) {
		current = { ...next };
		for (const it of items) {
			const n = current[it.d.type] || 0;
			it.$on.empty().prop('hidden', !n);
			if (n) it.$on.append(icon('check'), $('<span>').text(t('{n} on the dashboard', { n }, '{n} on the dashboard')));
			const single = !it.d.multiple && n > 0;
			it.$btn.prop('disabled', single).attr('title', single ? t('Only one copy of this widget is allowed') : null)
				.empty().append(icon(single ? 'check' : 'plus'), $('<span>').text(single ? t('Added') : t('Add')));
			it.$li.toggleClass('is-on', n > 0);
		}
	}

	function filter() {
		const q = norm($search.val()).trim();
		const words = q.split(/\s+/).filter(Boolean);
		let shown = 0;
		for (const it of items) {
			const hit = words.every((w) => it.hay.includes(w));
			it.$li.prop('hidden', !hit);
			if (hit) shown++;
		}
		$list.children('.fs-wcat-group').each((_, g) => { $(g).prop('hidden', !$(g).find('.fs-wcat-item:not([hidden])').length); });
		$none.prop('hidden', shown > 0).find('.fs-wcat-none-title').text(t('No widgets match "{q}"', { q: $search.val().trim() }));
		$count.text(q ? t('{n} widget found', { n: shown }, '{n} widgets found') : '');
	}
	$search.on('input', filter);
	$search.on('keydown', (e) => {
		if (e.key === 'Enter') { e.preventDefault(); const first = items.find((it) => !it.$li.prop('hidden') && !it.$btn.prop('disabled')); if (first) first.$btn.trigger('focus'); }
	});
	if (!items.length) {
		$searchWrap.prop('hidden', true);
		$none.prop('hidden', false).find('.fs-wcat-none-title').text(t('No widgets are available'));
		$none.find('.fs-wcat-none-text').text(t('Widgets appear here when FreeSense or a package registers them.'));
	}
	setCounts(current);
	return { $root, setCounts, focusSearch: () => $search.trigger('focus'), filter(q) { $search.val(q); filter(); } };
}

/**
 * Open the catalogue in a drawer. Adding a widget closes the drawer, so the
 * dashboard can scroll to and focus the new widget.
 *   { counts, onAdd(type), title }
 */
export function openCatalogue({ counts = {}, onAdd = null, title = null } = {}) {
	let d = null;
	const cat = catalogueNode({
		counts,
		onAdd(type) {
			d.close({ restoreFocus: false });
			if (onAdd) onAdd(type);
		}
	});
	d = drawer.open({
		title: title || t('Add widget'),
		subtitle: t('Pick a widget for your dashboard. You can add several copies with different settings.'),
		icon: 'table-cells-large',
		body: [cat.$root[0]],
		footer: [{ label: t('Close') }]
	});
	cat.focusSearch();
	return { close: () => d.close(), setCounts: cat.setCounts };
}

el.define('widget-catalogue', {
	init(node, config) {
		const $node = $(node).addClass('fs-wcat-host').empty();
		const emitAdd = (type) => $node.trigger('fs:widget-add', [{ type }]);
		const countsOf = () => {
			if (config.counts) return config.counts;
			const dash = config.for ? document.getElementById(config.for) : null;
			const inst = dash && el.get(dash);
			return inst && inst.counts ? inst.counts() : {};
		};
		const onAdd = (type) => {
			const dash = config.for ? document.getElementById(config.for) : null;
			const inst = dash && el.get(dash);
			if (inst && inst.add) inst.add(type);
			emitAdd(type);
		};
		let cat = null;
		if (config.inline) {
			cat = catalogueNode({ counts: countsOf(), onAdd, types: config.types || null, compact: !!config.compact });
			$node.append(cat.$root);
			if (config.query) cat.filter(config.query);
		} else {
			const label = config.label || t('Add widget');
			const $b = $('<button type="button" class="btn">').addClass(`btn-${config.variant || 'secondary'}`)
				.append(icon('plus'), $('<span>').text(label)).on('click', () => openCatalogue({ counts: countsOf(), onAdd }));
			if (config.size === 'sm') $b.addClass('btn-sm');
			$node.append($b);
		}
		return {
			/** Open the catalogue drawer. */
			open: () => openCatalogue({ counts: countsOf(), onAdd }),
			/** Update the "on the dashboard" counts of an inline list. */
			setCounts(c) { config.counts = c; if (cat) cat.setCounts(c); }
		};
	}
});
