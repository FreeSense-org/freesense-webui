/*
 * confirm.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * confirm — promise-based confirmation dialog (RULES R3: never window.confirm).
 *
 *   import { confirm } from '../confirm/confirm.js';
 *   if (await confirm({ title: 'Delete alias WEB_SERVERS?', confirmLabel: 'Delete', danger: true })) …
 *
 * The element (data-fs-el="confirm") renders a button that asks first and
 * then runs a configured API call, so PHP pages need no JS of their own.
 * Temporary bridge: window.FS.confirm.
 *
 * dialog() is shared with danger-confirm and modal-form: a Bootstrap modal
 * built in JS that removes itself when hidden and returns focus to the
 * element that was focused before it opened.
 */
import $ from 'jquery';
import { Modal } from 'bootstrap';
import { el } from '../../js/el.js';
import { api } from '../../js/api.js';
import { toast, t, bridge, icon, apiPath } from '../toast/toast.js';

let seq = 0;

/**
 * Build and show a dialog. Returns { $dialog, $body, $footer, close(result), result: Promise }.
 *   title, icon, tone ('danger' | 'warn' | null), size ('sm' | null), static (backdrop), focus (selector or fn)
 */
export function dialog({ title, icon: ic = null, tone = null, size = null, static: isStatic = false, focus = null, labelledBy = null } = {}) {
	const id = `fs-dialog-${++seq}`;
	const returnTo = document.activeElement;
	const $title = $('<h2 class="modal-title fs-dialog-title">').attr('id', `${id}-title`).text(title || '');
	const $head = $('<div class="modal-header fs-dialog-head">');
	if (ic) $head.append($('<span class="fs-dialog-icon">').append(icon(ic)));
	$head.append($title, $('<button type="button" class="btn btn-ghost fs-dialog-x" data-bs-dismiss="modal">')
		.attr({ 'aria-label': t('Close'), title: t('Close') }).append(icon('xmark')));
	const $body = $('<div class="modal-body fs-dialog-body">').attr('id', `${id}-body`);
	const $footer = $('<div class="modal-footer fs-dialog-foot">');
	const $dialog = $('<div class="modal fade fs-dialog" tabindex="-1">')
		.attr({ id, 'aria-labelledby': labelledBy || `${id}-title`, 'aria-describedby': `${id}-body` })
		.attr('data-tone', tone)
		.append($('<div class="modal-dialog modal-dialog-centered">').toggleClass('modal-sm', size === 'sm')
			.append($('<div class="modal-content">').append($head, $body, $footer)));

	let result;
	let settle;
	const promise = new Promise((resolve) => { settle = resolve; });
	const modal = new Modal($dialog[0], { backdrop: isStatic ? 'static' : true, keyboard: true, focus: true });

	let shown = false;
	let closeWhenShown = false;
	$dialog.on('shown.bs.modal', () => {
		shown = true;
		/* A close requested during the opening animation (Bootstrap ignores it) runs now. */
		if (closeWhenShown) { modal.hide(); return; }
		const target = typeof focus === 'function' ? focus() : $dialog.find(focus || '.fs-dialog-primary').filter(':visible:not(:disabled)')[0];
		(target || $dialog.find('.fs-dialog-x')[0]).focus();
	});
	$dialog.on('hidden.bs.modal', () => {
		modal.dispose();
		$dialog.remove();
		if (returnTo && document.body.contains(returnTo) && typeof returnTo.focus === 'function') returnTo.focus();
		settle(result);
	});

	$('body').append($dialog);
	modal.show();
	return {
		$dialog, $body, $footer,
		result: promise,
		/** Close with a result (the promise resolves after the closing animation). */
		close(r) {
			result = r;
			if (shown) modal.hide(); else closeWhenShown = true;
		}
	};
}

/** A footer button. variant: 'primary' | 'secondary' | 'danger'. */
export function button(label, { variant = 'secondary', ic = null, primary = false, type = 'button' } = {}) {
	return $(`<button class="btn">`).attr('type', type).addClass(`btn-${variant}`).toggleClass('fs-dialog-primary', primary)
		.append(ic ? icon(ic) : null, ic ? document.createTextNode(' ') : null, $('<span>').text(label));
}

/**
 * Busy state on a button while a request runs. A focused button is not
 * disabled (that would drop focus to <body>); it is marked aria-disabled and
 * click handlers check isBusy().
 */
export function busy($btn, on) {
	const focused = $btn[0] === document.activeElement;
	$btn.prop('disabled', on && !focused).attr({ 'aria-busy': on ? 'true' : null, 'aria-disabled': on ? 'true' : null }).toggleClass('is-busy', on);
	if (on) $btn.prepend($('<span class="spinner-border spinner-border-sm fs-busy" aria-hidden="true">'));
	else $btn.find('.fs-busy').remove();
}

export const isBusy = ($btn) => $btn.hasClass('is-busy');

/** Body text: a paragraph, plus an optional list of details (e.g. affected rules). */
export function bodyText($body, text, details) {
	if (text) $body.append($('<p class="fs-dialog-text">').text(text));
	if (details && details.length) {
		$body.append($('<ul class="fs-dialog-details">').append(details.map((d) => $('<li>').text(d))));
	}
}

/**
 * Ask a yes/no question. Resolves true (confirmed) or false (cancelled, Escape, backdrop).
 *   { title, text, details: [..], confirmLabel, cancelLabel, danger, icon }
 */
export function confirm(o = {}) {
	if (typeof o === 'string') o = { title: o };
	const danger = !!o.danger;
	const d = dialog({
		title: o.title || t('Are you sure?'),
		icon: o.icon || (danger ? 'triangle-exclamation' : null),
		tone: danger ? 'danger' : null,
		size: 'sm',
		/* Destructive questions start on Cancel, so Enter never destroys by accident. */
		focus: danger ? '.fs-dialog-cancel' : '.fs-dialog-primary'
	});
	bodyText(d.$body, o.text, o.details);
	if (!o.text && !(o.details && o.details.length)) d.$body.remove();
	const $cancel = button(o.cancelLabel || t('Cancel')).addClass('fs-dialog-cancel').on('click', () => d.close(false));
	const $ok = button(o.confirmLabel || t('Confirm'), { variant: danger ? 'danger' : 'primary', primary: true }).on('click', () => d.close(true));
	d.$footer.append($cancel, $ok);
	return d.result.then((r) => r === true);
}

/* ------------------------------------------------- request after confirm */

/** Run a configured request ({method, path, body}) and report it with a toast; triggers fs:pending. */
export function runAction(action, { success, node } = {}) {
	return api.request((action.method || 'POST').toUpperCase(), apiPath(action.path), action.body ?? (action.method === 'DELETE' ? null : {})).then((res) => {
		const meta = res.meta || {};
		const msg = meta.message || success;
		if (msg) toast(msg, { level: 'ok' });
		if (meta.pending) $(document).trigger('fs:pending', [{ path: action.path }]);
		if (node) $(node).trigger('fs:done', [res]);
		return res;
	}, (e) => {
		toast.error(e);
		if (node) $(node).trigger('fs:failed', [e]);
		throw e;
	});
}

/** Trigger button used by the confirm, danger-confirm and modal-form elements. */
export function triggerButton(config, fallback) {
	const $b = $('<button type="button" class="btn">').addClass(`btn-${config.variant || 'secondary'}`);
	if (config.danger && !config.variant) $b.addClass('fs-btn-danger-quiet');
	if (config.size === 'sm') $b.addClass('btn-sm');
	if (config.icon) $b.append(icon(config.icon));
	const label = config.label || fallback;
	if (config.iconOnly && config.icon) $b.attr({ 'aria-label': label, title: label });
	else $b.append(config.icon ? document.createTextNode(' ') : null, $('<span>').text(label));
	return $b;
}

el.define('confirm', {
	init(node, config) {
		const $node = $(node).addClass('fs-confirm');
		const $btn = triggerButton(config, t('Confirm')).appendTo($node);
		async function ask() {
			if (isBusy($btn)) return false;
			const ok = await confirm({ ...config, icon: config.dialogIcon });
			$node.trigger('fs:confirm', [ok]);
			if (!ok || !config.action) return ok;
			busy($btn, true);
			try { await runAction(config.action, { success: config.success, node }); } catch { /* reported by toast */ } finally { busy($btn, false); }
			return ok;
		}
		$btn.on('click', ask);
		return { ask, destroy() { $btn.off(); } };
	}
});

bridge('confirm', confirm);
