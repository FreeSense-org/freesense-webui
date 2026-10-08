/*
 * session-list.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * session-list — the user's active sessions: device and browser, IP, when
 * it started and was last seen, a "This device" badge. Other sessions can be
 * signed out (DELETE /v1/me/sessions/{id}) after an inline confirmation.
 * See spec.md.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { api } from '../../js/api.js';
import { batch } from '../../js/batch.js';
import { states } from '../../js/states.js';
import { fmt } from '../../js/fmt.js';
import { live } from '../../js/live.js';
import { t, icon, notify, apiPath } from '../avatar/identity.js';

/** Device icon from the agent string. */
export function deviceIcon(agent) {
	const a = String(agent || '').toLowerCase();
	if (/iphone|android|mobile|pixel/.test(a)) return 'mobile-screen-button';
	if (/ipad|tablet/.test(a)) return 'tablet-screen-button';
	if (/curl|api|cli|script|ssh/.test(a)) return 'terminal';
	return 'laptop';
}

el.define('session-list', {
	init(node, config, ctx) {
		const c = { source: { path: '/v1/me/sessions' }, every: 30, revoke: '/v1/me/sessions/{id}', revokeOthers: true, title: 'Active sessions', ...config };
		const $node = $(node).addClass('fs-session-list').empty();
		const $others = $('<button type="button" class="btn btn-secondary btn-sm fs-session-list-others">').append(icon('right-from-bracket'), document.createTextNode(` ${t('Sign out other sessions')}`)).prop('hidden', true);
		const $head = $('<div class="fs-session-list-head">').append(
			$('<div>').append($('<h2 class="fs-session-list-title">').text(t(c.title)),
				$('<p class="fs-session-list-desc">').text(t('Devices signed in to this account. Sign out any you do not recognise.'))),
			c.revokeOthers ? $others : null);
		const $body = $('<div class="fs-session-list-body">');
		const $live = $('<span class="visually-hidden" role="status" aria-live="polite">');
		$node.append($head, $body, $live);

		let rows = [];
		const gone = new Set();
		let confirming = null;
		let task = null;

		function visible() { return rows.filter((s) => !gone.has(String(s.id))); }

		function confirmBox(s) {
			const $box = $('<div class="fs-session-list-confirm" role="group">').attr('aria-label', t('Confirm sign out'));
			$box.append(
				$('<span class="fs-session-list-confirm-text">').text(t('Sign out this session? The device must sign in again.')),
				$('<span class="fs-session-list-confirm-actions">').append(
					$('<button type="button" class="btn btn-secondary btn-sm">').text(t('Cancel')).on('click', () => { confirming = null; render(); focusRevoke(s.id); }),
					$('<button type="button" class="btn btn-danger btn-sm">').append(icon('right-from-bracket'), document.createTextNode(` ${t('Sign out')}`)).on('click', () => revoke([String(s.id)]))));
			$box.on('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); confirming = null; render(); focusRevoke(s.id); } });
			return $box;
		}

		function focusRevoke(id) { $body.find(`[data-id="${CSS.escape(String(id))}"] .fs-session-list-revoke`).trigger('focus'); }

		function item(s) {
			const id = String(s.id);
			const $li = $('<li class="fs-session-list-item">').attr('data-id', id).toggleClass('is-current', !!s.current);
			const $main = $('<div class="fs-session-list-main">');
			const $name = $('<p class="fs-session-list-agent">').append($('<span>').text(s.agent || t('Unknown device')));
			if (s.current) $name.append($('<span class="fs-session-list-badge">').append(icon('circle-check'), $('<span>').text(t('This device'))));
			const $meta = $('<p class="fs-session-list-meta">').append(
				$('<span class="fs-session-list-ip fs-mono">').text(s.ip || '—'),
				s.started ? $('<span>').append(document.createTextNode(`${t('Signed in')} `), $('<time>').attr({ datetime: s.started, title: fmt.datetime(s.started) }).text(fmt.ago(s.started))) : null,
				s.last_seen ? $('<span>').append(document.createTextNode(`${t('Last seen')} `), $('<time>').attr({ datetime: s.last_seen, title: fmt.datetime(s.last_seen) }).text(s.current ? t('now') : fmt.ago(s.last_seen))) : null);
			$main.append($name, $meta);
			$li.append($('<span class="fs-session-list-icon">').append(icon(deviceIcon(s.agent))), $main);
			if (!s.current) {
				$li.append($('<button type="button" class="btn btn-secondary btn-sm fs-session-list-revoke">')
					.attr({ 'aria-label': t('Sign out {agent}', { agent: s.agent || id }), 'aria-expanded': String(confirming === id) })
					.text(t('Sign out'))
					.on('click', () => { confirming = id; render(); $body.find(`[data-id="${CSS.escape(id)}"] .fs-session-list-confirm .btn-secondary`).trigger('focus'); }));
			}
			if (confirming === id) $li.append(confirmBox(s));
			return $li;
		}

		function render() {
			const list = visible();
			$others.prop('hidden', list.filter((s) => !s.current).length < 2);
			if (!list.length) return false;
			const sorted = [...list].sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0) || String(b.last_seen || '').localeCompare(String(a.last_seen || '')));
			const $ul = $('<ul class="fs-session-list-items">');
			sorted.forEach((s) => $ul.append(item(s)));
			$body.empty().append($ul);
			return true;
		}

		function revoke(ids) {
			ids.forEach((id) => gone.add(id));
			confirming = null;
			if (!render()) states.empty($body, { icon: 'laptop', title: t('No other sessions') });
			$others.trigger('focus');
			Promise.allSettled(ids.map((id) => api.del(apiPath(c.revoke).replace('{id}', encodeURIComponent(id))))).then((res) => {
				const failed = [];
				res.forEach((r, i) => { if (r.status === 'rejected') { failed.push(r.reason); gone.delete(ids[i]); } else rows = rows.filter((s) => String(s.id) !== ids[i]); });
				const okCount = ids.length - failed.length;
				if (okCount) {
					const msg = okCount === 1 ? t('Session signed out') : t('{n} sessions signed out', { n: okCount });
					$live.text(msg);
					notify('ok', msg);
				}
				if (failed.length) {
					render();
					notify('error', t('Could not sign out the session: {msg}', { msg: failed[0].message }));
				}
			});
		}

		$others.on('click', function () {
			if ($others.attr('data-armed') === 'true') {
				$others.removeAttr('data-armed').empty().append(icon('right-from-bracket'), document.createTextNode(` ${t('Sign out other sessions')}`));
				revoke(visible().filter((s) => !s.current).map((s) => String(s.id)));
				return;
			}
			$others.attr('data-armed', 'true').empty().append(icon('triangle-exclamation'), document.createTextNode(` ${t('Click again to sign out {n} sessions', { n: visible().filter((s) => !s.current).length })}`));
			setTimeout(() => {
				if ($others.attr('data-armed') === 'true') $others.removeAttr('data-armed').empty().append(icon('right-from-bracket'), document.createTextNode(` ${t('Sign out other sessions')}`));
			}, 5000);
		});

		task = states.load(ctx, $body, () => batch.get(apiPath(c.source.path), c.source.query).then((r) => r.data), (data) => {
			rows = Array.isArray(data) ? data : [];
			if (confirming && $body.find('.fs-session-list-confirm').length && $.contains($body[0], document.activeElement)) return true;
			return render();
		}, { every: c.every, lines: 4, $root: $node, empty: { icon: 'laptop', title: t('No active sessions'), text: t('Sessions appear here when this account signs in.') } });

		return {
			reload() { if (task) live.now(task.id); },
			destroy() {}
		};
	}
});
