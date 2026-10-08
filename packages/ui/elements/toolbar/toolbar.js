/*
 * toolbar.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * toolbar — sits above a collection (usually a data-table): debounced search,
 * filter selects and chips, an optional view switch, right-aligned actions,
 * and a bulk-action bar that replaces search and filters while the parent
 * reports a selection (setSelection(n)).
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { t, icon, emit, actionNode, disposeMenus } from '../page-header/actions.js';
import { childNode, startChildren } from '../card/nest.js';

let seq = 0;

el.define('toolbar', {
	init(node, config) {
		const uid = `fs-tb-${++seq}`;
		const $node = $(node).addClass('fs-toolbar').empty().attr({ role: 'toolbar', 'aria-label': config.label || t('Collection tools') });
		const $main = $('<div class="fs-toolbar-main">');
		const $bulk = $('<div class="fs-toolbar-bulk" hidden>');
		const $end = $('<div class="fs-toolbar-end">');
		const $live = $('<span class="visually-hidden" aria-live="polite">');
		const filters = {};
		const painters = {};
		let q = '';
		let timer = null;
		let selection = 0;

		/* search */
		let $input = null;
		if (config.search) {
			const s = config.search === true ? {} : config.search;
			const delay = s.delay ?? 250;
			q = s.value || '';
			$input = $('<input type="search" class="form-control fs-toolbar-input" autocomplete="off" spellcheck="false">')
				.attr({ id: `${uid}-q`, placeholder: s.placeholder || t('Search'), 'aria-label': s.label || s.placeholder || t('Search') }).val(q);
			const fire = () => { emit(node, 'fs:search', { q, el: 'toolbar' }); };
			$input.on('input', () => {
				q = String($input.val()).trim();
				clearTimeout(timer);
				timer = setTimeout(fire, delay);
			}).on('keydown', (e) => {
				if (e.key === 'Enter') { clearTimeout(timer); fire(); }
				if (e.key === 'Escape' && $input.val()) { e.preventDefault(); $input.val(''); q = ''; clearTimeout(timer); fire(); }
			});
			$main.append($('<div class="fs-toolbar-search">').append(icon('magnifying-glass').addClass('fs-toolbar-search-icon'), $input));
		}

		/* filters */
		const emitFilter = (id, value) => emit(node, 'fs:filter', { id, value, values: { ...filters }, el: 'toolbar' });
		const $filters = $('<div class="fs-toolbar-filters">');
		for (const f of config.filters || []) {
			if (!f || !f.id) continue;
			const opts = f.options || [];
			if (f.type === 'chips') {
				const multiple = !!f.multiple;
				filters[f.id] = multiple ? [...(f.value || [])] : (f.value ?? (opts[0] && opts[0].value));
				const $g = $('<div class="fs-toolbar-chips" role="group">').attr('aria-label', f.label || f.id);
				const paint = () => $g.children().each((_, b) => {
					const v = b.getAttribute('data-value');
					const on = multiple ? filters[f.id].includes(v) : String(filters[f.id]) === v;
					b.setAttribute('aria-pressed', on ? 'true' : 'false');
				});
				for (const o of opts) {
					$g.append($('<button type="button" class="fs-toolbar-chip">').attr('data-value', String(o.value))
						.append(o.icon ? icon(o.icon) : null, $('<span>').text(o.label ?? o.value),
							o.count != null ? $('<span class="fs-toolbar-chip-count">').text(o.count) : null)
						.on('click', () => {
							const v = String(o.value);
							if (multiple) filters[f.id] = filters[f.id].includes(v) ? filters[f.id].filter((x) => x !== v) : [...filters[f.id], v];
							else filters[f.id] = v;
							paint();
							emitFilter(f.id, filters[f.id]);
						}));
				}
				paint();
				painters[f.id] = paint;
				$filters.append($g);
			} else {
				filters[f.id] = f.value ?? '';
				const $sel = $('<select class="form-select fs-toolbar-select">').attr({ id: `${uid}-f-${f.id}`, 'aria-label': f.label || f.id });
				if (f.all !== false) $sel.append($('<option value="">').text(f.all || `${f.label || ''}: ${t('All')}`.replace(/^: /, '')));
				for (const o of opts) $sel.append($('<option>').val(String(o.value)).text(o.label ?? o.value));
				$sel.val(String(filters[f.id])).on('change', () => { filters[f.id] = $sel.val(); emitFilter(f.id, filters[f.id]); });
				painters[f.id] = () => $sel.val(String(filters[f.id] ?? ''));
				$filters.append($sel);
			}
		}
		if ($filters.children().length) $main.append($filters);

		/* bulk bar */
		const onBulk = (a) => emit(node, 'fs:action', { id: a.id, bulk: true, selection, el: 'toolbar' });
		const $count = $('<span class="fs-toolbar-count">');
		const $clear = $('<button type="button" class="btn btn-ghost btn-sm fs-toolbar-clear">').append(icon('xmark'), $('<span>').text(t('Clear')))
			.attr('title', t('Clear selection')).on('click', () => emit(node, 'fs:selection-clear', { el: 'toolbar' }));
		$bulk.append($count, $('<div class="fs-toolbar-bulk-actions">').append((config.bulk || []).map((a) => actionNode(a, { onAction: onBulk, size: 'sm' }))), $clear);

		/* end: view switch + actions */
		const onAction = (a) => emit(node, 'fs:action', { id: a.id, bulk: false, el: 'toolbar' });
		let $view = null;
		if (config.view) { $view = childNode({ el: 'view-switch', config: { size: 'sm', ...config.view } }); $end.append($view); }
		for (const a of config.actions || []) $end.append(actionNode(a, { onAction, variant: 'secondary' }));

		$node.append($main, $bulk);
		if ($end.children().length) $node.append($end);
		$node.append($live);
		if ($view) startChildren($view);

		function setSelection(n) {
			const prev = selection;
			selection = Math.max(0, Number(n) || 0);
			const on = selection > 0 && (config.bulk || []).length > 0;
			$bulk.prop('hidden', !on);
			$main.prop('hidden', on);
			$node.toggleClass('has-selection', on);
			$count.text(`${selection} ${t('selected')}`);
			if (prev !== selection) $live.text(selection ? `${selection} ${t('selected')}` : t('Selection cleared'));
		}

		if (config.selection) setSelection(config.selection);

		return {
			/** Show the bulk bar for n selected items (0 hides it). */
			setSelection,
			/** Current search and filter values. */
			values: () => ({ q, filters: { ...filters } }),
			/** Set the search text without emitting fs:search. */
			setSearch(text) { q = text || ''; if ($input) $input.val(q); },
			/** Set a filter value without emitting fs:filter. */
			setFilter(id, value) {
				if (!painters[id]) return;
				filters[id] = value;
				painters[id]();
			},
			destroy() { clearTimeout(timer); disposeMenus(node); }
		};
	}
});
