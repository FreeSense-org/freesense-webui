/*
 * section.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * section — a titled group of content inside a page (title, description,
 * actions, nested elements) without card chrome.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { t, emit, icon, actionNode, menuNode, disposeMenus } from '../page-header/actions.js';
import { renderContent } from '../card/nest.js';

let seq = 0;

el.define('section', {
	init(node, config) {
		const id = `fs-section-${++seq}`;
		const $node = $(node).addClass('fs-section').empty();
		const onAction = (a) => emit(node, 'fs:action', { id: a.id, el: 'section' });
		if (config.divider) $node.addClass('has-divider');
		const $body = $('<div class="fs-section-body">');

		if (config.title || (config.actions || []).length || (config.menu || []).length) {
			const $head = $('<div class="fs-section-head">');
			const $lead = $('<div class="fs-section-lead">');
			const $title = $(`<h${config.level === 3 ? 3 : 2} class="fs-section-title">`).attr('id', `${id}-title`);
			if (config.icon) $title.append(icon(config.icon).addClass('fs-section-icon'));
			$title.append($('<span>').text(config.title || ''));
			$lead.append($title);
			if (config.description) $lead.append($('<p class="fs-section-desc">').text(config.description));
			$head.append($lead);
			const $tools = $('<div class="fs-section-tools">');
			for (const a of config.actions || []) $tools.append(actionNode(a, { onAction, size: 'sm', variant: 'secondary' }));
			if ((config.menu || []).length) $tools.append(menuNode(config.menu, { onAction, size: 'sm', label: t('Section actions') }));
			if ($tools.children().length) $head.append($tools);
			$node.append($head);
			if (config.title) $node.attr({ role: 'region', 'aria-labelledby': `${id}-title` });
		}
		$node.append($body);
		renderContent($body, config.content);

		return {
			/** The body container (jQuery). */
			body: () => $body,
			/** Replace the nested content (same shapes as card content). */
			setContent(content) { config.content = content; renderContent($body, content); },
			destroy() { disposeMenus(node); }
		};
	}
});
