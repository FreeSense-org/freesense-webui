/*
 * split-view.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * split-view — list and detail side by side (nested elements). Stacks on
 * screens below 992 px. With `resizable`, a divider can be dragged or moved
 * with the arrow keys.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { t } from '../page-header/actions.js';
import { renderContent } from '../card/nest.js';

const MIN = 12;

el.define('split-view', {
	init(node, config) {
		const $node = $(node).addClass('fs-split').empty();
		const $list = $('<div class="fs-split-pane fs-split-list" role="region">').attr('aria-label', config.listLabel || t('List'));
		const $detail = $('<div class="fs-split-pane fs-split-detail" role="region">').attr('aria-label', config.detailLabel || t('Details'));
		const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
		const max = () => (node.clientWidth ? Math.max(MIN, Math.floor((node.clientWidth / rem()) * 0.6)) : 60);
		let width = Number(config.listWidth) || 20;
		let $bar = null;

		function setWidth(w, limit = true) {
			width = Math.max(MIN, Math.min(limit ? max() : 60, Math.round(w * 4) / 4));
			node.style.setProperty('--fs-split-w', `${width}rem`);
			if ($bar) $bar.attr({ 'aria-valuenow': Math.round(width), 'aria-valuemax': max() });
			return width;
		}

		$node.append($list);
		if (config.resizable) {
			$bar = $('<div class="fs-split-bar" role="separator" aria-orientation="vertical" tabindex="0">')
				.attr({ 'aria-label': t('Resize list'), 'aria-valuemin': MIN, title: t('Drag or use the arrow keys to resize') });
			let drag = null;
			$bar.on('pointerdown', (e) => {
				if (e.button !== 0) return;
				e.preventDefault();
				drag = { x: e.clientX, w: width };
				$bar[0].setPointerCapture(e.pointerId);
				$node.addClass('is-resizing');
			}).on('pointermove', (e) => {
				if (drag) setWidth(drag.w + (e.clientX - drag.x) / rem());
			}).on('pointerup pointercancel', () => {
				if (!drag) return;
				drag = null;
				$node.removeClass('is-resizing');
				$(node).trigger('fs:resize', [{ el: 'split-view', width }]);
			}).on('keydown', (e) => {
				const step = e.shiftKey ? 4 : 1;
				const next = { ArrowLeft: width - step, ArrowRight: width + step, Home: MIN, End: max() }[e.key];
				if (next === undefined) return;
				e.preventDefault();
				setWidth(next);
				$(node).trigger('fs:resize', [{ el: 'split-view', width }]);
			});
			$node.addClass('is-resizable').append($bar);
		}
		$node.append($detail);
		setWidth(width, false);
		renderContent($list, config.list);
		renderContent($detail, config.detail);

		return {
			/** Replace the detail pane (same shapes as card content). */
			setDetail(content) { config.detail = content; renderContent($detail, content); },
			setList(content) { config.list = content; renderContent($list, content); },
			/** Set the list width in rem (wide screens); returns the applied width. */
			width: (w) => (w == null ? width : setWidth(w))
		};
	}
});
