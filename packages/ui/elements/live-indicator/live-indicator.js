/*
 * live-indicator.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * live-indicator — shows whether the data on the page is live, paused,
 * out of date or disconnected, with a pause/resume button (FS.live.pause()).
 *
 * Sources of truth, all without polling of its own unless `source` is set:
 *   - 'fs:live-paused' on the document (FS.live.pause)
 *   - element states: nodes marked data-fs-stale / data-fs-state="stale" by
 *     FS.states (watched with a MutationObserver)
 *   - optional `source`: its own heartbeat task; failures show "Connection lost"
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { live } from '../../js/live.js';
import { batch } from '../../js/batch.js';
import { t, icon, apiPath } from '../toast/toast.js';

let seq = 0;

/* state → [icon, label, description] */
const STATES = {
	live: ['circle', 'Live', 'Data updates automatically.'],
	paused: ['pause', 'Paused', 'Live updates are paused.'],
	stale: ['clock-rotate-left', 'Out of date', 'Some data could not be refreshed.'],
	offline: ['plug-circle-xmark', 'Connection lost', 'The firewall is not answering. Retrying.']
};

el.define('live-indicator', {
	init(node, config, ctx) {
		const ns = `.fs-live-ind-${++seq}`;
		const labels = config.labels || {};
		const $node = $(node).addClass('fs-live-indicator').toggleClass('is-compact', !!config.compact);
		const $icon = $('<span class="fs-live-indicator-icon">');
		const $label = $('<span class="fs-live-indicator-label">');
		const $state = $('<span class="fs-live-indicator-state" role="status">').append($icon, $label);
		const $btn = $('<button type="button" class="btn btn-ghost fs-live-indicator-btn">');
		$node.empty().append($state);
		if (config.control !== false) $node.append($btn); else $node.addClass('is-static');

		let own = 'ok';
		let staleCount = 0;
		let current = null;
		let lastPaused = null;

		function compute() {
			if (live.paused) return 'paused';
			if (own === 'error') return 'offline';
			if (own === 'stale' || staleCount > 0) return 'stale';
			return 'live';
		}
		function render() {
			const s = compute();
			const [ic, label, desc] = STATES[s];
			const text = t(labels[s] || label);
			if (s !== current) {
				current = s;
				$node.attr('data-state', s);
				$icon.empty().append(icon(ic));
				$label.text(text).toggleClass('visually-hidden', !!config.compact);
				$node.attr('title', `${text}. ${t(desc)}`);
			}
			const paused = live.paused;
			/* Touch the DOM only on change: the page observer below would otherwise loop. */
			if (paused === lastPaused) return;
			lastPaused = paused;
			const btnLabel = paused ? t('Resume live updates') : t('Pause live updates');
			$btn.attr({ 'aria-label': btnLabel, title: btnLabel, 'aria-pressed': String(paused) })
				.empty().append(icon(paused ? 'play' : 'pause'));
		}

		$btn.on('click', () => live.pause());
		$(document).on(`fs:live-paused${ns}`, render);

		/* Count stale elements on the page (or inside config.scope). */
		const scopeNode = () => (config.scope && document.querySelector(config.scope)) || document.body;
		let queued = false;
		function recount() {
			queued = false;
			staleCount = $(scopeNode()).find('[data-fs-stale], [data-fs-state="stale"]').not(node).length;
			render();
		}
		const observer = new MutationObserver(() => {
			if (queued) return;
			queued = true;
			setTimeout(recount, 150);
		});
		observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-fs-stale', 'data-fs-state'] });

		if (config.source && config.source.path) {
			ctx.live({
				id: 'heartbeat',
				every: config.every ?? 10,
				run: () => batch.get(apiPath(config.source.path), config.source.query),
				onState(s) {
					own = s === 'loading' ? own : s;
					render();
				}
			});
		}
		recount();

		return {
			get state() { return compute(); },
			destroy() { $(document).off(ns); observer.disconnect(); }
		};
	}
});
