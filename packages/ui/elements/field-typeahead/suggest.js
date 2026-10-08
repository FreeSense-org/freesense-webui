/*
 * suggest.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Suggestions under a text input (typeahead, address, port). The input stays
 * a free-text field; the popup offers matches from fetch(q) and fills the
 * input on pick. Requests are debounced and stale answers are dropped.
 *
 *   const s = suggest($input, $anchor, { fetch: (q) => Promise<items>, onPick(item), label });
 *   s.close(); s.destroy();
 */
import $ from 'jquery';
import { listbox } from '../field-select/listbox.js';
import { t } from '../form/fields.js';

export function suggest($input, $anchor, { fetch, onPick, label = null, labelledBy = null, minChars = 0, debounce = 160 } = {}) {
	const $pop = $('<div class="fs-pop fs-suggest">').prop('hidden', true);
	const lb = listbox({ labelledBy, label: label || t('Suggestions'), onPick: (it) => { close(); onPick(it); } });
	const $status = $('<p class="visually-hidden" role="status">');
	$pop.append(lb.$ul, $status);
	$anchor.addClass('fs-pop-anchor').append($pop);
	lb.bind($input);

	let timer = null;
	let req = 0;
	let open = false;

	function close() {
		clearTimeout(timer);
		req++;
		open = false;
		$pop.prop('hidden', true);
		$input.attr('aria-expanded', 'false').attr('aria-activedescendant', null);
	}

	function run(force = false) {
		const q = String($input.val() || '').trim();
		if (!force && q.length < minChars) { close(); return; }
		const my = ++req;
		clearTimeout(timer);
		timer = setTimeout(() => {
			Promise.resolve(fetch(q)).then((items) => {
				if (my !== req || document.activeElement !== $input[0] || $input.prop('disabled')) return;
				if (!items || !items.length) { close(); return; }
				lb.render(items.slice(0, 50), { selected: q });
				$status.text(t('{n} suggestion', { n: items.length }, '{n} suggestions'));
				$pop.prop('hidden', false);
				$input.attr('aria-expanded', 'true');
				open = true;
			}, () => { if (my === req) close(); });
		}, force ? 0 : debounce);
	}

	$input.on('input.fs-suggest', () => { if (document.activeElement === $input[0]) run(); });
	$input.on('keydown.fs-suggest', (e) => {
		if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); close(); return; }
		if (e.key === 'ArrowDown' && !open) { e.preventDefault(); run(true); return; }
		if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') && lb.key(e)) e.preventDefault();
		if (e.key === 'Tab') close();
	});
	$input.on('blur.fs-suggest', () => setTimeout(close, 120));

	return {
		close,
		open: () => run(true),
		destroy() { close(); $input.off('.fs-suggest'); $pop.remove(); }
	};
}
