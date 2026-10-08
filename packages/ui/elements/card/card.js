/*
 * card.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * card — titled surface: icon, title, subtitle, status, header actions and
 * menu, body (nested content, see nest.js), footer; optionally collapsible.
 * Follows the theme's card skin (data-fs-skin-cards: flat|outlined|raised).
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { statusNode } from '../status/status.js';
import { t, icon, emit, actionNode, menuNode, disposeMenus } from '../page-header/actions.js';
import { renderContent } from './nest.js';

let seq = 0;

el.define('card', {
	init(node, config) {
		const id = `fs-card-${++seq}`;
		const $node = $(node).addClass('fs-card').empty();
		const onAction = (a) => emit(node, 'fs:action', { id: a.id, el: 'card' });
		const $body = $('<div class="fs-card-body">').attr('id', `${id}-body`);
		const $foot = $('<div class="fs-card-foot">');
		let $toggle = null;
		let $title = null;

		if (config.flush) $node.addClass('is-flush');

		const hasHead = config.title || config.icon || (config.actions || []).length || (config.menu || []).length || config.status;
		if (hasHead) {
			const $head = $('<div class="fs-card-head">');
			const $lead = $('<div class="fs-card-lead">');
			if (config.icon) $head.append($('<span class="fs-card-icon">').append(icon(config.icon)));
			$title = $(`<h${config.level === 3 ? 3 : 2} class="fs-card-title">`).attr('id', `${id}-title`).text(config.title || '');
			if (config.collapsible) {
				$toggle = $('<button type="button" class="fs-card-toggle">').attr({ 'aria-controls': `${id}-body`, 'aria-expanded': 'true' })
					.append($('<span class="fs-card-title-text">').text(config.title || ''), icon('chevron-down').addClass('fs-card-chevron'))
					.on('click', () => collapse(!$node.hasClass('is-collapsed')));
				$title.empty().append($toggle);
			}
			$lead.append($title);
			if (config.subtitle) $lead.append($('<p class="fs-card-subtitle">').text(config.subtitle));
			$head.append($lead);
			const $tools = $('<div class="fs-card-tools">');
			if (config.status) $tools.append(statusNode(config.status.state, config.status.label, { detail: config.status.detail, variant: 'pill' }));
			for (const a of config.actions || []) $tools.append(actionNode({ iconOnly: !!a.icon, ...a }, { onAction, variant: 'ghost', size: 'sm' }));
			if ((config.menu || []).length) $tools.append(menuNode(config.menu, { onAction, size: 'sm', label: t('Card actions') }));
			if ($tools.children().length) $head.append($tools);
			$node.append($head);
			$node.attr('aria-labelledby', `${id}-title`).attr('role', 'region');
		}
		$node.append($body);
		renderContent($body, config.content);

		function renderFooter(f) {
			$foot.empty();
			if (!f) { $foot.remove(); return; }
			if (typeof f === 'string') $foot.append($('<span class="fs-card-foot-text">').text(f));
			else {
				if (f.text) $foot.append($('<span class="fs-card-foot-text">').text(f.text));
				if ((f.actions || []).length) $foot.append($('<div class="fs-card-foot-actions">').append(f.actions.map((a, i) => actionNode(a, { onAction, size: 'sm', variant: i === 0 && f.primary ? 'primary' : 'secondary' }))));
				if (f.link) $foot.append(actionNode({ ...f.link, variant: 'link' }, { onAction, size: 'sm' }).addClass('fs-card-foot-link'));
			}
			if (!$foot.parent().length) $node.append($foot);
		}
		renderFooter(config.footer);

		function collapse(on) {
			if (!config.collapsible) return;
			$node.toggleClass('is-collapsed', !!on);
			$body.prop('hidden', !!on);
			$foot.prop('hidden', !!on);
			if ($toggle) $toggle.attr('aria-expanded', on ? 'false' : 'true');
			emit(node, 'fs:toggle', { el: 'card', collapsed: !!on });
		}
		if (config.collapsible && config.collapsed) collapse(true);

		return {
			/** Collapse (true) or expand (false) a collapsible card. */
			collapse,
			/** The body container (jQuery), e.g. to find nested elements. */
			body: () => $body,
			/** Replace the body content (same shapes as config.content). */
			setContent(content) { config.content = content; renderContent($body, content); },
			setTitle(text) { config.title = text; if ($toggle) $toggle.find('.fs-card-title-text').text(text); else if ($title) $title.text(text); },
			setFooter(f) { config.footer = f; renderFooter(f); },
			destroy() { disposeMenus(node); }
		};
	}
});
