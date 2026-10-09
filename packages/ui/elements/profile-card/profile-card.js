/*
 * profile-card.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * profile-card — the signed-in user's summary: avatar, name, username,
 * role and groups, email, language, start page and last sign-in. Edit opens
 * a small inline form that saves through PUT /v1/me/profile and shows 422
 * field errors next to the inputs. See spec.md.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { api } from '../../js/api.js';
import { batch } from '../../js/batch.js';
import { states } from '../../js/states.js';
import { fmt } from '../../js/fmt.js';
import { avatarNode } from '../avatar/avatar.js';
import { t, icon, me, notify, apiPath } from '../avatar/identity.js';

const LANGUAGES = [
	{ value: 'en', label: 'English' }, { value: 'da', label: 'Dansk' }, { value: 'de', label: 'Deutsch' },
	{ value: 'es', label: 'Español' }, { value: 'fr', label: 'Français' }, { value: 'nl', label: 'Nederlands' }
];

/* Start pages are stored as routes ('/security/aliases'); menu links carry the page base (<meta name="fs-base">, '/next'). */
const routeOf = (href) => {
	const base = document.querySelector('meta[name="fs-base"]')?.getAttribute('content') || '';
	return base && (href === base || href.startsWith(`${base}/`)) ? href.slice(base.length) || '/' : href;
};

/** Start-page choices from the navigation model: the dashboard, then every item (values are routes). */
function navPages() {
	let model = {};
	try { model = JSON.parse(document.getElementById('fs-nav')?.textContent || '{}'); } catch { /* none */ }
	const out = [];
	for (const a of model.areas || []) {
		if (a.href) out.push({ value: routeOf(a.href), label: a.title });
		for (const g of a.groups || []) for (const it of g.items || []) out.push({ value: routeOf(it.href), label: `${a.title} › ${it.title}` });
	}
	return out;
}

let seq = 0;

el.define('profile-card', {
	init(node, config, ctx) {
		const c = { source: { path: '/v1/me/profile' }, every: 0, editable: true, save: '/v1/me/profile', ...config };
		const uid = `fs-pc-${++seq}`;
		const $node = $(node).addClass('fs-profile-card').empty();
		const $body = $('<div class="fs-profile-card-body">');
		$node.append($body);
		/* The default source is the shared signed-in user (identity.js me). */
		const shared = (c.source.path === '/v1/me/profile' || c.source.path === '/v1/me') && !c.source.query;
		let user = null;
		let editing = false;
		const ns = `.fspc${seq}`;

		const languages = () => c.languages || LANGUAGES;
		const startPages = () => {
			const list = c.startPages || navPages();
			return list.length ? list : [{ value: '/', label: t('Dashboard') }];
		};
		const labelOf = (list, v) => (list.find((o) => o.value === v) || {}).label || v || '—';

		function view() {
			const u = user;
			const $top = $('<div class="fs-profile-card-top">');
			const $who = $('<div class="fs-profile-card-who">').append($('<h2 class="fs-profile-card-name">').text(u.name || u.username || t('Unnamed user')));
			const $sub = $('<p class="fs-profile-card-sub">');
			if (u.username) $sub.append($('<span class="fs-profile-card-user">').text(`@${u.username}`));
			if (u.role) $sub.append($('<span class="fs-profile-card-role">').text(u.role));
			$who.append($sub);
			if (u.groups && u.groups.length) {
				const $g = $('<ul class="fs-profile-card-groups">').attr('aria-label', t('Groups'));
				u.groups.forEach((g) => $g.append($('<li>').append(icon('user-group'), $('<span>').text(g))));
				$who.append($g);
			}
			$top.append(avatarNode({ name: u.name, username: u.username, initials: u.initials, src: u.avatar, size: 'xl', label: false }), $who);
			if (c.editable) {
				$top.append($('<button type="button" class="btn btn-secondary btn-sm fs-profile-card-edit">')
					.append(icon('pen'), document.createTextNode(` ${t('Edit')}`))
					.attr('aria-label', t('Edit profile'))
					.on('click', () => edit()));
			}
			const $dl = $('<dl class="fs-profile-card-facts">');
			const fact = (ic, k, $v) => $dl.append($('<div class="fs-profile-card-fact">').append($('<dt>').append(icon(ic), $('<span>').text(t(k))), $('<dd>').append($v)));
			fact('envelope', 'Email', u.email ? $('<span class="fs-profile-card-email">').text(u.email) : $('<span class="fs-muted">').text(t('Not set')));
			if (u.language !== undefined) fact('language', 'Language', $('<span>').text(labelOf(languages(), u.language)));
			fact('house', 'Start page', $('<span>').text(labelOf(startPages(), u.start_page)));
			if (u.last_login) fact('right-to-bracket', 'Last sign-in', $('<time>').attr({ datetime: u.last_login, title: fmt.datetime(u.last_login) }).text(`${fmt.ago(u.last_login)} · ${fmt.datetime(u.last_login)}`));
			if (u.created) fact('calendar', 'Member since', $('<time>').attr('datetime', u.created).text(new Date(u.created).toLocaleDateString()));
			$body.empty().append($top, $dl);
		}

		function field(name, label, $input, hint) {
			const id = `${uid}-${name}`;
			$input.attr({ id, name }).addClass($input.is('select') ? 'form-select' : 'form-control');
			const $f = $('<div class="fs-profile-card-field">').attr('data-field', name).append($('<label class="form-label">').attr('for', id).text(t(label)), $input);
			if (hint) $f.append($('<div class="form-text">').attr('id', `${id}-hint`).text(t(hint)));
			return $f;
		}
		function select(list, value) {
			const $s = $('<select>');
			const all = list.some((o) => o.value === value) || !value ? list : [{ value, label: value }, ...list];
			all.forEach((o) => $s.append($('<option>').val(o.value).text(o.label)));
			return $s.val(value || all[0]?.value);
		}

		function edit() {
			editing = true;
			const u = user;
			const $form = $('<form class="fs-profile-card-form" novalidate>').attr('aria-label', t('Edit profile'));
			const $summary = $('<div class="fs-profile-card-summary" role="alert" hidden>');
			$form.append(
				$('<div class="fs-profile-card-formhead">').append(
					avatarNode({ name: u.name, username: u.username, initials: u.initials, src: u.avatar, size: 'lg', label: false }),
					$('<div>').append($('<h2 class="fs-profile-card-name">').text(t('Edit profile')), $('<p class="fs-profile-card-sub">').text(`@${u.username || ''}`))),
				$summary,
				$('<div class="fs-profile-card-grid">').append(
					field('name', 'Name', $('<input type="text" autocomplete="name" required maxlength="64">').val(u.name || '')),
					field('email', 'Email', $('<input type="email" autocomplete="email">').val(u.email || ''), 'Used for notices and password resets.'),
					u.language !== undefined ? field('language', 'Language', select(languages(), u.language)) : null,
					field('start_page', 'Start page', select(startPages(), u.start_page), 'Opens after you sign in.')),
				$('<div class="fs-profile-card-actions">').append(
					$('<button type="submit" class="btn btn-primary btn-sm">').append(icon('check'), document.createTextNode(` ${t('Save')}`)),
					$('<button type="button" class="btn btn-secondary btn-sm">').text(t('Cancel')).on('click', () => done())));
			$form.on('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); done(); } });
			$form.on('submit', (e) => { e.preventDefault(); submit($form, $summary); });
			$body.empty().append($form);
			$form.find('#' + CSS.escape(`${uid}-name`)).trigger('focus');
		}

		function clearErrors($form, $summary) {
			$summary.prop('hidden', true).empty();
			$form.find('.is-invalid').removeClass('is-invalid').removeAttr('aria-invalid');
			$form.find('.invalid-feedback').remove();
			$form.find('[aria-describedby]').each(function () {
				const hint = `${this.id}-hint`;
				$(this).attr('aria-describedby', document.getElementById(hint) ? hint : null);
			});
		}

		function submit($form, $summary) {
			clearErrors($form, $summary);
			const val = (k) => String($form.find(`[name="${k}"]`).val() || '').trim();
			/* The profile takes name and email (and language where the API has it); the start page is a preference. */
			const data = { name: val('name'), email: val('email') };
			if (user.language !== undefined) data.language = val('language');
			const startPage = val('start_page');
			const $btns = $form.find('button').prop('disabled', true);
			$form.attr('aria-busy', 'true');
			api.put(apiPath(c.save), data).then((r) => (startPage && startPage !== user.start_page
				? api.put(apiPath('/v1/me/preferences'), { start_page: startPage }).then(() => r) : r)).then((r) => {
				const next = { ...user, ...data, ...(r.data || {}), start_page: startPage || user.start_page };
				user = next;
				if (shared) me.set(next);
				notify('ok', (r.meta && r.meta.message) || t('Profile saved'));
				done();
			}, (e) => {
				$btns.prop('disabled', false);
				$form.removeAttr('aria-busy');
				$summary.prop('hidden', false).append(icon('triangle-exclamation'), $('<span>').text(e.message));
				let first = null;
				for (const [name, msg] of Object.entries(e.fields || {})) {
					const $in = $form.find(`[name="${name}"]`);
					if (!$in.length) continue;
					const fid = `${$in.attr('id')}-error`;
					$in.addClass('is-invalid').attr('aria-invalid', 'true')
						.attr('aria-describedby', [fid, $in.attr('aria-describedby')].filter(Boolean).join(' '));
					$in.after($('<div class="invalid-feedback">').attr('id', fid).text(msg));
					first = first || $in;
				}
				(first || $form.find('[name="name"]')).trigger('focus');
			});
		}

		function done() {
			editing = false;
			view();
			$body.find('.fs-profile-card-edit').trigger('focus');
		}

		const fetch = () => (shared ? me.get(true) : batch.get(apiPath(c.source.path), c.source.query).then((r) => r.data));
		states.load(ctx, $body, fetch, (u) => {
			if (!u || !Object.keys(u).length) return false;
			user = u;
			if (!editing) view();
			return true;
		}, { every: c.every, lines: 5, $root: $node, empty: { icon: 'circle-user', title: t('No profile'), text: t('This account has no profile data.') } });

		$(document).on(`fs:me${ns}`, (e, u) => { if (shared && !editing) { user = { ...user, ...u }; view(); } });
		return {
			edit: () => user && edit(),
			destroy() { $(document).off(ns); }
		};
	}
});
