/*
 * grid.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * grid — responsive 12-column layout of nested elements. Each item has a
 * span per breakpoint (base, sm ≥ 576 px, md ≥ 768 px, lg ≥ 992 px); a
 * breakpoint without a value inherits the one below it.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { childNode, startChildren } from '../card/nest.js';

const BPS = ['base', 'sm', 'md', 'lg'];
const GAPS = ['none', 'sm', 'md', 'lg'];

const clampSpan = (n) => Math.max(1, Math.min(12, Math.round(Number(n)) || 12));

/** span: 6 | {base, sm, md, lg} → class names */
export function spanClasses(span) {
	const s = typeof span === 'object' && span ? span : { base: span == null ? 12 : span };
	const out = [`fs-col-${clampSpan(s.base ?? 12)}`];
	for (const bp of BPS.slice(1)) if (s[bp] != null) out.push(`fs-col-${bp}-${clampSpan(s[bp])}`);
	return out.join(' ');
}

el.define('grid', {
	init(node, config) {
		const $node = $(node).addClass('fs-grid').empty().attr('data-gap', GAPS.includes(config.gap) ? config.gap : 'md');
		if (config.align === 'start') $node.attr('data-align', 'start');

		function itemNode(item) {
			const span = item.span ?? config.span ?? 12;
			return $('<div class="fs-grid-item">').addClass(spanClasses(span)).append(childNode(item));
		}
		function render(items) {
			$node.empty().append((items || []).filter((i) => i && i.el).map(itemNode));
			startChildren($node.children());
		}
		render(config.items);

		return {
			/** Replace all items. */
			setItems(items) { config.items = items; render(items); },
			/** Append one item ({el, config, span}); returns its element node. */
			add(item) {
				const $i = itemNode(item).appendTo($node);
				startChildren($i);
				return $i.children()[0];
			}
		};
	}
});
