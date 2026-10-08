/*
 * listbox.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Listbox popup shared by the searchable select, the typeahead, address and
 * port fields. The text input that drives it keeps focus (combobox pattern:
 * aria-activedescendant), so screen readers announce the active option.
 *
 *   const lb = listbox({ labelledBy, onPick(item) });
 *   lb.bind($input);                  wires role=combobox and keys
 *   lb.render(items, { selected });   items: [{value, label, detail, group, icon}]
 *   lb.key(e) → true when handled     ArrowUp/Down, Home/End, Enter
 */
import $ from 'jquery';
import { uid, icon, t } from '../form/fields.js';

export function listbox({ labelledBy = null, label = null, onPick = () => {} } = {}) {
	const id = uid('lb');
	const $ul = $('<ul class="fs-listbox" role="listbox">').attr({ id, 'aria-labelledby': labelledBy, 'aria-label': labelledBy ? null : label });
	let items = [];
	let active = -1;
	let $input = null;

	function setActive(i, scroll = true) {
		const $opts = $ul.children('[role=option]');
		if (!$opts.length) { active = -1; if ($input) $input.attr('aria-activedescendant', null); return; }
		active = Math.max(0, Math.min(i, $opts.length - 1));
		$opts.removeClass('is-active');
		const $a = $opts.eq(active).addClass('is-active');
		if ($input) $input.attr('aria-activedescendant', $a.attr('id'));
		if (scroll && $a[0] && $a[0].scrollIntoView) $a[0].scrollIntoView({ block: 'nearest' });
	}

	function render(list, { selected = null, activeValue } = {}) {
		items = list;
		$ul.empty();
		let group;
		let n = 0;
		const sel = selected instanceof Set ? selected : new Set(selected == null ? [] : [].concat(selected).map(String));
		list.forEach((it) => {
			if (it.group && it.group !== group) {
				group = it.group;
				$ul.append($('<li class="fs-listbox-group" role="presentation">').text(group));
			}
			const isSel = sel.has(String(it.value));
			const $li = $('<li role="option" class="fs-listbox-option">').attr({ id: `${id}-${n}`, 'aria-selected': isSel ? 'true' : 'false', 'data-i': n })
				.toggleClass('is-selected', isSel).toggleClass('is-disabled', !!it.disabled);
			if (it.disabled) $li.attr('aria-disabled', 'true');
			if (it.icon) $li.append($('<span class="fs-listbox-icon">').append(icon(it.icon)));
			const $txt = $('<span class="fs-listbox-text">').append($('<span class="fs-listbox-label">').text(it.label));
			if (it.detail) $txt.append($('<span class="fs-listbox-detail">').text(it.detail));
			$li.append($txt, $('<span class="fs-listbox-check">').append(icon('check')));
			$ul.append($li);
			n++;
		});
		const idx = activeValue !== undefined ? list.findIndex((x) => String(x.value) === String(activeValue)) : -1;
		setActive(idx >= 0 ? idx : 0, idx >= 0);
	}

	function pick(i) {
		const it = items[i];
		if (it && !it.disabled) onPick(it);
	}

	$ul.on('mousedown', (e) => e.preventDefault());
	$ul.on('click', '[role=option]', function () { pick(+this.getAttribute('data-i')); });
	$ul.on('mousemove', '[role=option]', function () { const i = +this.getAttribute('data-i'); if (i !== active) setActive(i, false); });

	return {
		id,
		$ul,
		get count() { return items.length; },
		get activeItem() { return items[active]; },
		bind($in) {
			$input = $in;
			$in.attr({ role: 'combobox', 'aria-controls': id, 'aria-autocomplete': 'list', 'aria-expanded': 'false' });
		},
		render,
		/** Handle a keydown from the bound input; returns true when consumed. */
		key(e) {
			if (!items.length) return false;
			if (e.key === 'ArrowDown') { setActive(active + 1); return true; }
			if (e.key === 'ArrowUp') { setActive(active - 1); return true; }
			if (e.key === 'Home' && e.ctrlKey) { setActive(0); return true; }
			if (e.key === 'End' && e.ctrlKey) { setActive(items.length - 1); return true; }
			if (e.key === 'Enter' && active >= 0) { pick(active); return true; }
			return false;
		},
		noMatches: () => $('<p class="fs-listbox-empty" role="status">').text(t('No matches'))
	};
}
