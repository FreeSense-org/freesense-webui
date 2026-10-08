/*
 * danger-confirm.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * danger-confirm — type-to-confirm for destructive actions. The confirm
 * button stays disabled until the user types the object's name exactly.
 *
 *   import { dangerConfirm } from '../danger-confirm/danger-confirm.js';
 *   if (await dangerConfirm({ title: 'Reset the state table', name: 'fw01', … })) …
 *
 * Temporary bridge: window.FS.dangerConfirm.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { t, bridge } from '../toast/toast.js';
import { dialog, button, busy, isBusy, bodyText, runAction, triggerButton } from '../confirm/confirm.js';

let seq = 0;

/**
 * Resolves true only after the name was typed and the button pressed.
 *   { title, text, details, name, confirmLabel, cancelLabel, prompt }
 */
export function dangerConfirm(o = {}) {
	const name = String(o.name ?? '');
	const id = `fs-dc-${++seq}`;
	const d = dialog({ title: o.title || t('Are you sure?'), icon: o.icon || 'triangle-exclamation', tone: 'danger', focus: () => $input[0] });
	d.$dialog.addClass('fs-danger-confirm');
	bodyText(d.$body, o.text, o.details);

	const $label = $('<label class="form-label fs-dc-label">').attr('for', id)
		.append(document.createTextNode(`${o.prompt || t('To confirm, type')} `), $('<code class="fs-dc-name">').text(name));
	const $input = $('<input type="text" class="form-control fs-dc-input" autocomplete="off" autocapitalize="off" spellcheck="false">')
		.attr({ id, 'aria-describedby': `${id}-hint` });
	const $hint = $('<p class="fs-dc-hint">').attr('id', `${id}-hint`).text(t('This cannot be undone.'));
	d.$body.append($('<div class="fs-dc-field">').append($label, $input, $hint));

	const $cancel = button(o.cancelLabel || t('Cancel')).addClass('fs-dialog-cancel').on('click', () => d.close(false));
	const $ok = button(o.confirmLabel || t('Delete'), { variant: 'danger', primary: true }).prop('disabled', true).on('click', () => {
		if ($input.val() === name) d.close(true);
	});
	d.$footer.append($cancel, $ok);

	const matches = () => name !== '' && $input.val() === name;
	$input.on('input', () => {
		const ok = matches();
		$ok.prop('disabled', !ok);
		$input.toggleClass('is-match', ok);
	}).on('keydown', (e) => {
		if (e.key === 'Enter') { e.preventDefault(); if (matches()) d.close(true); }
	});
	return d.result.then((r) => r === true);
}

el.define('danger-confirm', {
	init(node, config) {
		const $node = $(node).addClass('fs-confirm');
		const $btn = triggerButton({ danger: true, ...config }, t('Delete')).appendTo($node);
		async function ask() {
			if (isBusy($btn)) return false;
			const ok = await dangerConfirm({ ...config, icon: config.dialogIcon });
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

bridge('dangerConfirm', dangerConfirm);
