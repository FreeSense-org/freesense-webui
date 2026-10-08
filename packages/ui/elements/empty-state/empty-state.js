/*
 * empty-state.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * empty-state — a standalone empty state (no aliases yet, no VPN tunnels)
 * with icon, title, text and one primary action. It renders through
 * FS.states.empty, so it looks exactly like the empty state of data elements.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { states } from '../../js/states.js';
import { icon } from '../toast/toast.js';

el.define('empty-state', {
	init(node, config) {
		const $node = $(node).addClass('fs-empty-state');
		function render() {
			const a = config.action;
			const action = a && a.label ? {
				label: a.label,
				icon: a.icon || null,
				href: a.href || null,
				/* JSON configs cannot carry functions: `event` names a jQuery event triggered on the node. */
				onClick: a.event ? () => $node.trigger(a.event, [config]) : null
			} : null;
			states.empty($node, { icon: config.icon || 'inbox', title: config.title, text: config.text || '', action });
			const $s = $node.children('.fs-state');
			$s.attr('data-size', config.size || 'md');
			if (config.secondary && config.secondary.label && config.secondary.href) {
				$s.append($('<a class="fs-empty-state-secondary">').attr('href', config.secondary.href)
					.attr('data-fs-nav', config.secondary.nav === false ? null : '')
					.append($('<span>').text(config.secondary.label), icon('arrow-right')));
			}
		}
		render();
		return { set(next) { Object.assign(config, next); render(); } };
	}
});
