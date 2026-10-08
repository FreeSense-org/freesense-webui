/*
 * chip.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * chip — a small rounded label that can be a toggle (aria-pressed) or
 * removable (×). Toolbars and filters use chips for quick filters and for the
 * active filter list ("Action: Block ×").
 *
 * Events (bubble from the chip):
 *   fs:chip-toggle  [{ value, pressed }]
 *   fs:chip-remove  [{ value }]   preventDefault() keeps the chip in place
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { t, icon } from '../toast/toast.js';

/** Build one chip; also used by other elements (toolbar, filters). */
export function chipNode(c) {
	const value = c.value ?? c.label;
	const $c = $('<span class="fs-chip">').attr('data-value', value);
	const $content = $('<span class="fs-chip-content">');
	if (c.icon) $content.append(icon(c.icon));
	if (c.name) $content.append($('<span class="fs-chip-name">').text(`${c.name}:`));
	$content.append($('<span class="fs-chip-label">').text(c.label));
	if (c.count != null) $content.append($('<span class="fs-chip-count fs-num">').text(typeof c.count === 'number' ? c.count.toLocaleString() : c.count));

	if (c.toggle) {
		const $btn = $('<button type="button" class="fs-chip-main">').attr('aria-pressed', String(!!c.pressed)).append($content);
		if (c.disabled) $btn.prop('disabled', true);
		$btn.on('click', () => {
			const pressed = $btn.attr('aria-pressed') !== 'true';
			$btn.attr('aria-pressed', String(pressed));
			$c.toggleClass('is-pressed', pressed);
			$c.trigger('fs:chip-toggle', [{ value, pressed }]);
		});
		$c.addClass('is-toggle').toggleClass('is-pressed', !!c.pressed).append($btn);
	} else {
		$c.append($content.addClass('fs-chip-main'));
	}

	if (c.removable) {
		const name = c.name ? `${c.name}: ${c.label}` : c.label;
		const $x = $('<button type="button" class="fs-chip-remove">')
			.attr({ 'aria-label': t('Remove {name}', { name }), title: t('Remove') }).append(icon('xmark'));
		$x.on('click', () => {
			const ev = $.Event('fs:chip-remove');
			$c.trigger(ev, [{ value }]);
			if (ev.isDefaultPrevented()) return;
			/* Keep keyboard users in the list: focus the next chip, else the previous one. */
			const $group = $c.closest('.fs-chips');
			const $next = $c.next('.fs-chip').find('button').first();
			const $prev = $c.prev('.fs-chip').find('button').last();
			$c.remove();
			if ($group.length && !$group.children('.fs-chip.is-removable').length) $group.children('.fs-chips-clear').remove();
			if ($next.length) $next.trigger('focus');
			else if ($prev.length) $prev.trigger('focus');
			else if ($group.length) $group.attr('tabindex', '-1').trigger('focus');
		});
		$c.addClass('is-removable').append($x);
	}
	return $c;
}

el.define('chip', {
	init(node, config) {
		const $node = $(node);
		function render() {
			$node.empty();
			if (config.items) {
				$node.addClass('fs-chips').attr({ role: 'group', 'aria-label': config.label || t('Filters') });
				$node.append(config.items.map(chipNode));
				if (config.clearAll && config.items.some((c) => c.removable)) {
					$node.append($('<button type="button" class="btn btn-link btn-sm fs-chips-clear">').text(t('Clear all')).on('click', () => {
						const ev = $.Event('fs:chips-clear');
						$node.trigger(ev);
						if (!ev.isDefaultPrevented()) $node.children('.fs-chip.is-removable').remove();
						$node.children('.fs-chips-clear').remove();
					}));
				}
			} else {
				$node.removeClass('fs-chips').append(chipNode(config));
			}
		}
		render();
		return {
			set(next) { Object.assign(config, next); render(); },
			/** Values of the pressed toggle chips. */
			pressed() { return $node.find('.fs-chip.is-pressed').map((i, n) => n.getAttribute('data-value')).get(); }
		};
	}
});
