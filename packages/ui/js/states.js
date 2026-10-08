/*
 * states.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * FS.states — the shared loading / empty / error / stale UI every
 * data-driven element uses (RULES R2), so they look the same everywhere.
 *
 *   FS.states.loading($box, { lines: 3 })                 skeleton
 *   FS.states.empty($box, { icon, title, text, action })  action = {label, href | onClick}
 *   FS.states.error($box, { message, retry })             retry = () => void
 *   FS.states.stale($root, true|false)                    dims + marks data as out of date
 *   FS.states.load(ctx, $box, fetch, render, opts)        wires the above to a live task
 */
import $ from 'jquery';

function icon(name) { return $('<i aria-hidden="true">').addClass(`fa-solid fa-${name}`); }

export const states = {
	loading($box, { lines = 3, label = 'Loading' } = {}) {
		const $s = $('<div class="fs-state fs-state-loading" role="status">').append($('<span class="visually-hidden">').text(label));
		for (let i = 0; i < lines; i++) $s.append($('<span class="fs-skel">').css('width', `${[92, 76, 84, 64, 88][i % 5]}%`));
		$box.empty().append($s);
	},
	empty($box, { icon: ic = 'inbox', title = 'Nothing here yet', text = '', action = null } = {}) {
		const $s = $('<div class="fs-state fs-state-empty">').append(
			$('<span class="fs-state-icon">').append(icon(ic)),
			$('<p class="fs-state-title">').text(title));
		if (text) $s.append($('<p class="fs-state-text">').text(text));
		if (action) {
			const $a = action.href ? $('<a class="btn btn-primary btn-sm">').attr('href', action.href).attr('data-fs-nav', '') : $('<button type="button" class="btn btn-primary btn-sm">');
			$a.append(action.icon ? icon(action.icon) : null, document.createTextNode(` ${action.label}`));
			if (action.onClick) $a.on('click', action.onClick);
			$s.append($a);
		}
		$box.empty().append($s);
	},
	error($box, { message = 'Could not load this data.', retry = null } = {}) {
		const $s = $('<div class="fs-state fs-state-error" role="alert">').append(
			$('<span class="fs-state-icon">').append(icon('triangle-exclamation')),
			$('<p class="fs-state-title">').text('Something went wrong'),
			$('<p class="fs-state-text">').text(message));
		if (retry) $s.append($('<button type="button" class="btn btn-secondary btn-sm">').append(icon('rotate-right'), document.createTextNode(' Try again')).on('click', retry));
		$box.empty().append($s);
	},
	stale($root, on) {
		$root.toggleClass('is-stale', !!on).attr('data-fs-stale', on ? '' : null);
	},
	/**
	 * Standard data cycle for an element:
	 *   fetch()  -> Promise<data>   (use FS.batch.get for reads)
	 *   render(data, first) -> bool (return false to show the empty state)
	 * opts: { every, empty: {...}, lines, $root }
	 * Shows the skeleton first, the error state when the first load fails,
	 * and keeps the last good render (marked stale) when a later refresh fails.
	 */
	load(ctx, $box, fetch, render, opts = {}) {
		let loaded = false;
		const $root = opts.$root || $box;
		states.loading($box, { lines: opts.lines || 3 });
		const run = () => fetch().then((data) => {
			const hasContent = render(data, !loaded) !== false;
			if (!hasContent) states.empty($box, opts.empty || {});
			loaded = true;
			states.stale($root, false);
		});
		return ctx.live({
			every: opts.every ?? 0,
			run,
			onState(s, info) {
				ctx.state(s);
				if (s === 'error' && !loaded) states.error($box, { message: info.error, retry: () => { states.loading($box, { lines: opts.lines || 3 }); run().catch((e) => states.error($box, { message: e.message })); } });
				if (s === 'stale' || (s === 'error' && loaded)) states.stale($root, true);
			}
		});
	}
};
