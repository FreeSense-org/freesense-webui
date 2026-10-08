/*
 * field-secret.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * field-secret — password, pre-shared key or token: hidden by default, with
 * a reveal toggle and an optional generator (crypto.getRandomValues).
 * Registered as schema type `secret`.
 */
import { defineField, textInput, affix, iconButton, t } from '../form/fields.js';

const SETS = {
	alnum: 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789',
	hex: '0123456789abcdef',
	base64: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
	strong: 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_.:!#%+='
};

/** Uniform random string from a character set (rejection sampling, no modulo bias). */
export function generateSecret(length = 24, set = 'alnum') {
	const chars = SETS[set] || set;
	const out = [];
	const limit = 256 - (256 % chars.length);
	while (out.length < length) {
		const buf = crypto.getRandomValues(new Uint8Array(length * 2));
		for (const b of buf) if (b < limit && out.length < length) out.push(chars[b % chars.length]);
	}
	return out.join('');
}

defineField('secret', {
	build(f, c) {
		const $in = textInput({ ...f, mono: f.mono !== false }, c, 'password').attr('autocomplete', f.autocomplete || 'new-password');
		const $reveal = iconButton(t('Show'), 'eye').attr('aria-pressed', 'false');
		const gen = f.generate ? { length: 24, charset: 'alnum', ...(f.generate === true ? {} : f.generate) } : null;
		const $gen = gen ? iconButton(t('Generate'), 'wand-magic-sparkles') : null;
		function reveal(on) {
			$in.attr('type', on ? 'text' : 'password');
			const label = on ? t('Hide') : t('Show');
			$reveal.attr({ 'aria-pressed': on ? 'true' : 'false', 'aria-label': label, title: label })
				.find('i').attr('class', `fa-solid fa-${on ? 'eye-slash' : 'eye'}`);
		}
		$reveal.on('click', () => reveal($in.attr('type') === 'password'));
		if ($gen) $gen.on('click', () => { $in.val(generateSecret(gen.length, gen.charset)); reveal(true); c.change(); });
		$in.on('input', c.change);
		return {
			$el: affix($in, f, { $after: $gen ? $reveal.add($gen) : $reveal }).addClass('fs-secret'),
			$focus: $in,
			get: () => $in.val(),
			set: (v) => { $in.val(v ?? ''); reveal(false); },
			setDisabled(b) { $in.prop('disabled', b); $reveal.prop('disabled', b); if ($gen) $gen.prop('disabled', b); },
			display: (v) => (v ? '••••••••' : '')
		};
	}
});
