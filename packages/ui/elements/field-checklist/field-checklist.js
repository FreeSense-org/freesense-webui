/*
 * field-checklist.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * field-checklist — several values from a list, as visible checkboxes. Long
 * lists (more than 8, or `searchable: true`) get a search box and scroll
 * inside the field; a counter and Select all / Clear sit above the list.
 * Short lists flow into columns. Value: array in option order.
 * Registered as schema type `checklist`.
 */
import $ from 'jquery';
import { defineField, loadOptions, staticOptions, optionLabel, icon, uid, t } from '../form/fields.js';

const SEARCH_AT = 8;

defineField('checklist', {
	group: true,
	build(f, c) {
		let opts = staticOptions(f);
		let value = [];
		const base = uid('cl');
		const $box = $('<div class="fs-checklist" role="group">').attr('aria-label', c.ariaLabel || null);
		const $tools = $('<div class="fs-checklist-tools">');
		const $search = $('<input type="search" class="form-control form-control-sm fs-checklist-search" autocomplete="off">')
			.attr({ placeholder: t('Filter'), 'aria-label': t('Filter {label}', { label: f.label || f.name }) });
		const $count = $('<span class="fs-checklist-count fs-num" aria-live="polite">');
		const $all = $('<button type="button" class="btn btn-link btn-sm fs-checklist-act">').text(t('Select all'));
		const $none = $('<button type="button" class="btn btn-link btn-sm fs-checklist-act">').text(t('Clear'));
		const $list = $('<div class="fs-checklist-list">');
		const $empty = $('<p class="fs-checklist-empty">').text(t('No matches')).prop('hidden', true);
		$box.append($tools, $list, $empty);
		let disabled = false;

		function count() {
			$count.text(t('{n} of {total} selected', { n: value.length, total: opts.length }));
			$all.prop('disabled', disabled || value.length === opts.length);
			$none.prop('disabled', disabled || !value.length);
		}
		function render() {
			const searchable = f.searchable === true || (f.searchable !== false && opts.length > SEARCH_AT);
			$box.toggleClass('is-long', searchable).toggleClass('is-columns', !searchable && opts.length > 3 && !f.inline);
			$tools.empty().append(searchable ? $('<div class="fs-checklist-searchbox">').append(icon('magnifying-glass'), $search) : null, $count, $('<span class="fs-checklist-acts">').append($all, $none));
			$list.empty();
			let grp;
			const sel = new Set(value.map(String));
			opts.forEach((o, i) => {
				if (o.group && o.group !== grp) { grp = o.group; $list.append($('<p class="fs-checklist-group">').text(grp)); }
				const id = `${base}-${i}`;
				const $cb = $('<input type="checkbox" class="form-check-input">').attr({ id, 'data-i': i }).prop({ checked: sel.has(String(o.value)), disabled: disabled || !!o.disabled });
				const $txt = $('<span class="fs-check-text">').append($('<span class="fs-check-label">').text(o.label));
				if (o.detail) $txt.append($('<span class="fs-check-detail">').text(o.detail));
				$list.append($('<label class="fs-check">').attr({ for: id, 'data-q': `${o.label} ${o.value} ${o.detail || ''}`.toLowerCase() }).append($cb, $txt));
			});
			if (!opts.length) $list.append($('<p class="fs-checklist-empty">').text(t('No options available')));
			count();
		}
		function readChecked() {
			const on = new Set($list.find('input:checked').map((i, n) => +n.getAttribute('data-i')).get());
			/* Keep values that are not (or no longer) in the option list. */
			const known = new Set(opts.map((o) => String(o.value)));
			value = [...opts.filter((o, i) => on.has(i)).map((o) => o.value), ...value.filter((v) => !known.has(String(v)))];
		}
		$list.on('change', 'input', () => { readChecked(); count(); c.change(); });
		$search.on('input', () => {
			const q = $search.val().trim().toLowerCase();
			let shown = 0;
			$list.children('.fs-check').each((i, n) => { const hit = !q || n.getAttribute('data-q').includes(q); n.hidden = !hit; if (hit) shown++; });
			$list.children('.fs-checklist-group').prop('hidden', !!q);
			$empty.prop('hidden', shown > 0);
		});
		$search.on('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
		function setAll(on) {
			$list.find('.fs-check:not([hidden]) input:not(:disabled)').prop('checked', on);
			readChecked(); count(); c.change();
		}
		$all.on('click', () => setAll(true));
		$none.on('click', () => setAll(false));
		render();

		let ready = Promise.resolve();
		if (f.options && !Array.isArray(f.options) && f.options.source) {
			$list.empty().append($('<span class="fs-skel">'), $('<span class="fs-skel">'));
			ready = loadOptions(f).then((list) => { opts = list; render(); }, () => {
				$list.empty().append($('<p class="fs-checklist-empty">').append(icon('triangle-exclamation'), document.createTextNode(` ${t('Options could not be loaded.')}`)));
			});
		}

		return {
			$el: $box,
			$focus: $box,
			$describe: () => $box,
			ready,
			get: () => value.slice(),
			set(v) {
				value = Array.isArray(v) ? v.slice() : (v == null || v === '' ? [] : String(v).split(','));
				const sel = new Set(value.map(String));
				$list.find('input[data-i]').each((i, n) => { n.checked = sel.has(String(opts[+n.getAttribute('data-i')].value)); });
				count();
			},
			setDisabled(b) { disabled = b; $box.toggleClass('is-disabled', b); $list.find('input').prop('disabled', b); $search.prop('disabled', b); count(); },
			setInvalid: (b) => $box.toggleClass('is-invalid', b),
			focus: () => ($box.find('.fs-checklist-search:visible, input[type=checkbox]:not(:disabled)').first().trigger('focus')),
			display: (v) => v.map((x) => optionLabel(opts, x)).join(', ')
		};
	}
});
