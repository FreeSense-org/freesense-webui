/*
 * notifications.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * notifications — the top-bar bell. Polls GET /v1/notices, shows the unread
 * count, and opens a panel listing the notices (level, title, text, age,
 * link) with dismiss (DELETE /v1/notices/{id}) and Dismiss all. See spec.md.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { api } from '../../js/api.js';
import { batch } from '../../js/batch.js';
import { states } from '../../js/states.js';
import { fmt } from '../../js/fmt.js';
import { live } from '../../js/live.js';
import { t, icon, popover, notify, apiPath } from '../avatar/identity.js';

/* level → [state, icon, label]. The icon shape and a hidden label carry the level, not colour alone. */
const LEVELS = {
	danger: ['crit', 'circle-xmark', 'Critical'],
	error: ['crit', 'circle-xmark', 'Critical'],
	crit: ['crit', 'circle-xmark', 'Critical'],
	warning: ['warn', 'triangle-exclamation', 'Warning'],
	warn: ['warn', 'triangle-exclamation', 'Warning'],
	success: ['ok', 'circle-check', 'Resolved'],
	ok: ['ok', 'circle-check', 'Resolved'],
	info: ['info', 'circle-info', 'Information']
};

el.define('notifications', {
	init(node, config, ctx) {
		const c = {
			source: { path: '/v1/notices' },
			every: 30,
			dismiss: '/v1/notices/{id}',
			dismissAll: '/v1/notices',
			open: false,
			...config
		};
		const $node = $(node).addClass('fs-notifications').empty();
		const $count = $('<span class="fs-id-count" aria-hidden="true">');
		const $btn = $('<button type="button" class="fs-idbtn fs-notifications-btn" aria-haspopup="dialog">').append(icon('bell'), $count);
		const $panel = $('<div class="fs-notifications-panel fs-id-panel" role="dialog">').attr('aria-label', t('Notifications'));
		const $all = $('<button type="button" class="fs-notifications-all">').text(t('Dismiss all')).prop('hidden', true);
		const $head = $('<div class="fs-notifications-head">').append($('<h2 class="fs-notifications-title">').text(t('Notifications')), $all);
		const $body = $('<div class="fs-notifications-body">');
		const $live = $('<span class="visually-hidden" aria-live="polite">');
		$panel.append($head, $body);
		$node.append($btn, $panel, $live);

		let list = null;
		let loaded = false;
		let lastCount = null;
		const gone = new Set();

		function visible() { return (list || []).filter((n) => !gone.has(String(n.id))); }

		function setCount() {
			const n = visible().filter((x) => !x.read).length;
			$count.text(n ? (n > 99 ? '99+' : String(n)) : '');
			const label = n ? t('Notifications, {n} new', { n }) : t('Notifications');
			$btn.attr({ 'aria-label': label, title: t('Notifications') }).toggleClass('has-unread', n > 0);
			if (lastCount !== null && n > lastCount) $live.text(t('{n} new notifications', { n }));
			lastCount = n;
		}

		function item(n) {
			const [state, ic, label] = LEVELS[n.level] || LEVELS.info;
			const id = String(n.id);
			const $li = $('<li class="fs-notifications-item">').attr({ 'data-id': id, 'data-state': state });
			const $text = $('<div class="fs-notifications-text">');
			const $title = $('<p class="fs-notifications-item-title">').text(n.title || '');
			$text.append($title);
			if (n.body || n.text) $text.append($('<p class="fs-notifications-item-body">').text(n.body || n.text));
			const $meta = $('<p class="fs-notifications-meta">');
			if (n.time) $meta.append($('<time>').attr({ datetime: n.time, title: fmt.datetime(n.time) }).text(fmt.ago(n.time)));
			if (n.link) {
				const $a = $('<a class="fs-notifications-link">').attr('href', n.link).text(n.link_label || t('Open'));
				if (n.link.charAt(0) === '/') $a.attr('data-fs-nav', '');
				$a.on('click', () => pop.close());
				$meta.append($a);
			}
			$text.append($meta);
			const $x = $('<button type="button" class="fs-notifications-dismiss">')
				.attr({ 'aria-label': t('Dismiss: {title}', { title: n.title || '' }), title: t('Dismiss') })
				.append(icon('xmark'))
				.on('click', () => dismiss(id, $li));
			$li.append(
				$('<span class="fs-notifications-icon">').append(icon(ic), $('<span class="visually-hidden">').text(`${t(label)}: `)),
				$text, $x);
			return $li;
		}

		function render() {
			const items = visible();
			setCount();
			$all.prop('hidden', items.length < 2);
			if (!loaded) return;
			if (!items.length) {
				states.empty($body, { icon: 'bell-slash', title: t('You are all caught up'), text: t('New notices about gateways, services and updates appear here.') });
				return;
			}
			const focusedId = $body.find(':focus').closest('[data-id]').attr('data-id');
			const $ul = $('<ul class="fs-notifications-list">');
			items.forEach((n) => $ul.append(item(n)));
			$body.empty().append($ul);
			if (focusedId) $ul.find(`[data-id="${CSS.escape(focusedId)}"] .fs-notifications-dismiss`).trigger('focus');
		}

		function focusAfter($li) {
			const $next = $li.next().length ? $li.next() : $li.prev();
			if ($next.length) $next.find('.fs-notifications-dismiss').trigger('focus');
			else $btn.trigger('focus');
		}

		function dismiss(id, $li) {
			gone.add(id);
			focusAfter($li);
			render();
			$live.text(t('Notice dismissed'));
			api.del(apiPath(c.dismiss).replace('{id}', encodeURIComponent(id))).then(() => {
				list = (list || []).filter((n) => String(n.id) !== id);
				gone.delete(id);
			}, (e) => {
				gone.delete(id);
				render();
				notify('error', t('Could not dismiss the notice: {msg}', { msg: e.message }));
			});
		}

		$all.on('click', () => {
			const ids = visible().map((n) => String(n.id));
			ids.forEach((id) => gone.add(id));
			render();
			$btn.trigger('focus');
			pop.close();
			api.del(apiPath(c.dismissAll)).then(() => {
				list = (list || []).filter((n) => !ids.includes(String(n.id)));
				ids.forEach((id) => gone.delete(id));
				notify('ok', t('All notices dismissed'));
			}, (e) => {
				ids.forEach((id) => gone.delete(id));
				render();
				notify('error', t('Could not dismiss the notices: {msg}', { msg: e.message }));
			});
		});

		const pop = popover($node, $btn, $panel, {
			onOpen: () => { if (!loaded) states.loading($body, { lines: 3 }); else render(); },
			focus: () => $body.find('.fs-notifications-dismiss').first().add($panel.find('h2')).first()
		});
		$panel.find('h2').attr('tabindex', '-1');

		const task = ctx.live({
			id: 'notices',
			every: c.every,
			run: () => batch.get(apiPath(c.source.path), c.source.query).then((r) => {
				list = Array.isArray(r.data) ? r.data : [];
				loaded = true;
				states.stale($panel, false);
				render();
			}),
			onState(s, info) {
				ctx.state(s);
				$btn.attr('data-fs-state', s);
				if (s === 'error' && !loaded && pop.isOpen()) states.error($body, { message: info.error, retry: () => refresh() });
				if (s === 'error' && !loaded) $body.data('error', info.error);
				if (s === 'stale' || (s === 'error' && loaded)) states.stale($panel, true);
			}
		});
		function refresh() { states.loading($body, { lines: 3 }); live.now(task.id); }
		/* when the panel opens after a failed first load, show the error with retry */
		$btn.on('click', () => {
			if (!loaded && $body.data('error')) states.error($body, { message: $body.data('error'), retry: () => refresh() });
		});

		setCount();
		if (c.open) pop.open();

		return {
			open: () => pop.open(),
			close: () => pop.close(),
			reload: () => refresh(),
			destroy() { pop.destroy(); }
		};
	}
});
