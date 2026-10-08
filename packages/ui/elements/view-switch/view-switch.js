/*
 * view-switch.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * view-switch — segmented control for a small set of views of the same
 * data (table / cards, live / history). Emits fs:view; optionally synced
 * with a query parameter (?view=<id>).
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { t, icon, emit } from '../page-header/actions.js';

el.define('view-switch', {
	init(node, config) {
		const options = (config.options || []).filter((o) => o && o.id);
		const param = config.query === true ? 'view' : (config.query || null);
		const $node = $(node).addClass('fs-vs').empty().attr({ role: 'radiogroup', 'aria-label': config.label || t('View') });
		if (config.size === 'sm') $node.addClass('is-sm');
		if (config.block) $node.addClass('is-block');
		const btns = new Map();
		let value = null;

		for (const o of options) {
			const $b = $('<button type="button" class="fs-vs-option" role="radio" tabindex="-1" aria-checked="false">').attr('data-view', o.id);
			if (o.icon) $b.append(icon(o.icon));
			if (o.iconOnly) $b.attr({ 'aria-label': o.label || o.id, title: o.label || o.id }).addClass('is-icon');
			else $b.append($('<span>').text(o.label || o.id));
			if (o.disabled) $b.prop('disabled', true);
			$b.on('click', () => set(o.id));
			btns.set(o.id, $b);
			$node.append($b);
		}

		function set(id, { silent = false, focus = false } = {}) {
			const $b = btns.get(id);
			if (!$b || $b.prop('disabled')) return;
			const changed = value !== id;
			value = id;
			for (const [k, b] of btns) b.toggleClass('is-active', k === id).attr({ 'aria-checked': k === id ? 'true' : 'false', tabindex: k === id ? '0' : '-1' });
			if (focus) $b.trigger('focus');
			if (changed && !silent) {
				if (param && location.protocol !== 'file:') {
					const u = new URL(location.href);
					u.searchParams.set(param, id);
					history.replaceState(history.state, '', u);
				}
				emit(node, 'fs:view', { id, el: 'view-switch' });
			}
		}

		$node.on('keydown', (e) => {
			const ids = options.filter((o) => !o.disabled).map((o) => o.id);
			const i = ids.indexOf(value);
			const next = { ArrowRight: ids[(i + 1) % ids.length], ArrowDown: ids[(i + 1) % ids.length], ArrowLeft: ids[(i - 1 + ids.length) % ids.length], ArrowUp: ids[(i - 1 + ids.length) % ids.length], Home: ids[0], End: ids[ids.length - 1] }[e.key];
			if (next === undefined) return;
			e.preventDefault();
			set(next, { focus: true });
		});

		const fromUrl = param ? new URLSearchParams(location.search).get(param) : null;
		const start = [fromUrl, config.value].find((id) => id && btns.has(id) && !btns.get(id).prop('disabled')) || (options.find((o) => !o.disabled) || {}).id;
		if (start) set(start, { silent: true });

		return {
			/** Select a view (emits fs:view when it changes). */
			set: (id) => set(id),
			/** The selected view id. */
			value: () => value
		};
	}
});
