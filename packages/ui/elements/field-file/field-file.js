/*
 * field-file.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * field-file — pick or drop one file, checked against `accept` and
 * `maxSize` (bytes) before anything is sent.
 *   upload: {path}   POST multipart to the API with progress; the value is the
 *                    response data (e.g. {id, name, size}), which the form saves.
 *   read: 'text'     read in the browser (certificates, keys, config imports);
 *                    the value is {name, size, type, content}.
 * Registered as schema type `file`.
 */
import $ from 'jquery';
import { api } from '../../js/api.js';
import { fmt } from '../../js/fmt.js';
import { defineField, icon, iconButton, t } from '../form/fields.js';

function csrf() { return document.querySelector('meta[name="fs-csrf"]')?.getAttribute('content') || ''; }
const size = (n) => (fmt && fmt.bytes ? fmt.bytes(n) : `${n} B`);

function acceptOk(file, accept) {
	if (!accept) return true;
	const name = file.name.toLowerCase();
	return accept.split(',').map((s) => s.trim().toLowerCase()).some((a) => (a.startsWith('.') ? name.endsWith(a)
		: a.endsWith('/*') ? (file.type || '').startsWith(a.slice(0, -1)) : file.type === a));
}

defineField('file', {
	build(f, c) {
		const $input = $('<input type="file" class="fs-file-input" tabindex="-1" aria-hidden="true">').attr({ accept: f.accept || null });
		const $pick = $('<button type="button" class="btn btn-secondary btn-sm fs-file-pick">').attr({ id: c.id, 'aria-label': c.ariaLabel || null })
			.append(icon('folder-open'), $('<span>').text(t('Choose file')));
		const hints = [f.accept ? f.accept.split(',').map((s) => s.trim()).join(', ') : null, f.maxSize ? t('up to {size}', { size: size(f.maxSize) }) : null].filter(Boolean).join(' · ');
		const $drop = $('<div class="fs-file-drop">').append(
			$('<span class="fs-file-drop-icon">').append(icon('file-arrow-up')),
			$('<div class="fs-file-drop-text">').append($('<span>').text(t('Drop a file here or')), $pick,
				hints ? $('<span class="fs-file-hint">').text(hints) : null), $input);
		const $item = $('<div class="fs-file-item">').prop('hidden', true);
		const $name = $('<span class="fs-file-name">');
		const $meta = $('<span class="fs-file-meta fs-num">');
		const $bar = $('<div class="fs-file-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100">').append($('<span>'));
		const $rm = iconButton(t('Remove file'), 'xmark', 'btn-ghost btn-sm');
		$item.append($('<span class="fs-file-icon">').append(icon('file-lines')), $('<div class="fs-file-body">').append($('<div class="fs-file-line">').append($name, $meta), $bar), $rm);
		const $box = $('<div class="fs-file">').append($drop, $item);
		let value = null;
		let busy = null;
		let localError = null;

		function progress(p, label) {
			$bar.prop('hidden', p === null).toggleClass('is-indeterminate', p === -1);
			if (p >= 0) { $bar.attr({ 'aria-valuenow': Math.round(p), 'aria-label': label }); $bar.children()[0].style.setProperty('--fs-file-p', String(p / 100)); }
			else $bar.attr({ 'aria-valuenow': null, 'aria-label': label });
		}
		function showItem(v, state) {
			$item.prop('hidden', !v).attr('data-state', state || 'done');
			$drop.prop('hidden', !!v);
			if (!v) return;
			$name.text(v.name || t('File'));
			$meta.text([v.size != null ? size(v.size) : null, state === 'busy' ? t('Uploading…') : state === 'error' ? t('Failed') : null].filter(Boolean).join(' · '));
		}
		function fail(msg) {
			localError = msg;
			value = null;
			showItem(null);
			c.change();
			c.error(msg);
		}
		function take(file) {
			if (!file) return;
			localError = null;
			if (!acceptOk(file, f.accept)) { fail(t('{name} is not an accepted file type.', { name: file.name })); return; }
			if (f.maxSize && file.size > f.maxSize) { fail(t('{name} is larger than {size}.', { name: file.name, size: size(f.maxSize) })); return; }
			const meta = { name: file.name, size: file.size, type: file.type };
			showItem(meta, 'busy');
			progress(0, t('Reading {name}', { name: file.name }));
			if (f.upload) {
				const fd = new FormData();
				fd.append(f.uploadField || 'file', file, file.name);
				progress(-1, t('Uploading {name}', { name: file.name }));
				busy = $.ajax({
					url: api.url(f.upload.path, { ...(f.upload.query || {}), name: file.name, size: file.size }),
					type: 'POST', data: fd, processData: false, contentType: false, dataType: 'json',
					headers: { 'X-CSRF-Token': csrf(), 'X-Requested-With': 'FreeSense-WebUI' },
					xhr() {
						const x = $.ajaxSettings.xhr();
						if (x.upload) x.upload.addEventListener('progress', (e) => { if (e.lengthComputable) progress(e.loaded / e.total * 100, t('Uploading {name}', { name: file.name })); });
						return x;
					}
				}).done((res) => {
					value = { ...meta, ...(res && res.data ? res.data : {}) };
					progress(null);
					showItem(value);
					c.change();
				}).fail((xhr, status) => {
					if (status === 'abort') return;
					const e = xhr.responseJSON && xhr.responseJSON.error;
					fail((e && e.message) || t('The upload failed.'));
				}).always(() => { busy = null; });
				return;
			}
			const reader = new FileReader();
			reader.onprogress = (e) => { if (e.lengthComputable) progress(e.loaded / e.total * 100, t('Reading {name}', { name: file.name })); };
			reader.onload = () => { value = { ...meta, content: reader.result }; progress(null); showItem(value); c.change(); };
			reader.onerror = () => fail(t('The file could not be read.'));
			if (f.read === 'dataurl') reader.readAsDataURL(file); else reader.readAsText(file);
		}

		$pick.on('click', () => $input.trigger('click'));
		$input.on('change', () => { take($input[0].files[0]); $input.val(''); });
		$drop.on('dragover', (e) => { e.preventDefault(); if (!$pick.prop('disabled')) $drop.addClass('is-over'); })
			.on('dragleave drop', () => $drop.removeClass('is-over'))
			.on('drop', (e) => { e.preventDefault(); if (!$pick.prop('disabled')) take(e.originalEvent.dataTransfer.files[0]); });
		$rm.on('click', () => { if (busy) busy.abort(); busy = null; value = null; localError = null; showItem(null); c.change(); $pick.trigger('focus'); });

		return {
			$el: $box,
			get $focus() { return $item.prop('hidden') ? $pick : $rm; },
			$describe: () => $pick.add($rm),
			get: () => value,
			set(v) { value = v || null; progress(null); showItem(value); },
			setDisabled(b) { $pick.prop('disabled', b); $rm.prop('disabled', b); $box.toggleClass('is-disabled', b); },
			setInvalid: (b) => $box.toggleClass('is-invalid', b),
			badInput: () => localError || (busy ? t('Wait until the upload has finished.') : null),
			display: (v) => (v ? v.name : ''),
			destroy() { if (busy) busy.abort(); }
		};
	}
});
