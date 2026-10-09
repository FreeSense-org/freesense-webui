/*
 * page-header.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * page-header — the top of every page: breadcrumb (area / feature), title,
 * subtitle, status chips, one primary action, secondary actions and a help
 * link. On phones the secondary actions and help collapse into a menu.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { statusNode } from '../status/status.js';
import { t, emit, actionNode, menuNode, disposeMenus } from './actions.js';
import { modalForm } from '../modal-form/modal-form.js';

el.define('page-header', {
	init(node, config) {
		const $node = $(node).addClass('fs-ph').empty();
		const onAction = async (a) => {
			emit(node, 'fs:action', { id: a.id, el: 'page-header' });
			if (!a.form) return;
			/* A small form in a dialog; on success other elements (e.g. a table with reloadOn: 'fs:saved') refresh. */
			const res = await modalForm({ title: a.label, ...a.form });
			if (res) $(node).trigger('fs:saved', [res]);
		};

		const crumbs = config.breadcrumb || [];
		if (crumbs.length) {
			const $ol = $('<ol class="fs-ph-crumbs">');
			crumbs.forEach((c, i) => {
				const $li = $('<li>');
				const last = i === crumbs.length - 1;
				if (c.href && !last) $li.append($('<a data-fs-nav>').attr('href', c.href).text(c.label));
				else $li.append($('<span>').text(c.label)).attr('aria-current', last ? 'location' : null);
				$ol.append($li);
			});
			$node.append($('<nav class="fs-ph-nav">').attr('aria-label', t('Breadcrumb')).append($ol));
		}

		const $row = $('<div class="fs-ph-row">');
		const $lead = $('<div class="fs-ph-lead">');
		const $titleLine = $('<div class="fs-ph-titleline">');
		const $h1 = $('<h1 class="fs-ph-title">').text(config.title || '');
		const $chips = $('<div class="fs-ph-chips">');
		$titleLine.append($h1, $chips);
		const $sub = $('<p class="fs-ph-subtitle">');
		$lead.append($titleLine, $sub);

		function renderChips(chips) {
			$chips.empty().append((chips || []).map((c) => statusNode(c.state, c.label, { detail: c.detail, variant: 'pill' })));
			$chips.prop('hidden', !(chips || []).length);
		}
		function renderSub(text) { $sub.text(text || '').prop('hidden', !text); }
		renderChips(config.chips);
		renderSub(config.subtitle);

		const $actions = $('<div class="fs-ph-actions">');
		const secondary = config.actions || [];
		const help = config.help ? { id: 'help', icon: 'circle-question', label: config.help.label || t('Help'), href: config.help.href, external: config.help.external !== false } : null;
		if (help) $actions.append(actionNode({ ...help, iconOnly: true }, { variant: 'ghost' }).addClass(secondary.length ? 'fs-ph-help fs-ph-wide' : 'fs-ph-help'));
		for (const a of secondary) $actions.append(actionNode(a, { onAction, variant: 'secondary' }).addClass('fs-ph-wide'));
		/* phones: secondary actions (and help) move into one menu */
		const overflow = secondary.length && help ? [...secondary, { divider: true }, help] : secondary;
		if (overflow.length) $actions.append(menuNode(overflow, { onAction, label: t('More actions'), className: 'fs-ph-narrow' }));
		if (config.primary) $actions.append(actionNode(config.primary, { onAction, variant: 'primary' }).addClass('fs-ph-primary'));

		$row.append($lead);
		if ($actions.children().length) $row.append($actions);
		$node.append($row);

		return {
			setTitle(text) { config.title = text; $h1.text(text); },
			setSubtitle(text) { config.subtitle = text; renderSub(text); },
			/** Replace the status chips: [{state, label, detail}] */
			setChips(chips) { config.chips = chips; renderChips(chips); },
			/** Enable or disable an action (button, link or menu item) by id. */
			setDisabled(id, on) {
				$node.find('[data-fs-action]').filter((_, b) => b.getAttribute('data-fs-action') === id).each((_, b) => {
					if (b.tagName === 'A') $(b).toggleClass('disabled', !!on).attr({ 'aria-disabled': on ? 'true' : null, tabindex: on ? '-1' : null });
					else b.disabled = !!on;
				});
			},
			destroy() { disposeMenus(node); }
		};
	}
});
