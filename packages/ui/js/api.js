/*
 * api.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * FS.api — JSON client for the FreeSense REST API.
 *
 * Authenticates with the GUI session cookie plus the X-CSRF-Token header
 * (token from <meta name="fs-csrf">). Resolves to the response body
 * ({data, meta}); rejects with a normalised error:
 *   {status, code, message, fields}   fields = {name: message} on 422
 * A 401 emits 'fs:session-expired' so the shell can show the sign-in dialog;
 * the request is retried once the session is back.
 */
import $ from 'jquery';

const config = {
	base: '/api/v1',
	timeout: 15000
};

function csrf() {
	return document.querySelector('meta[name="fs-csrf"]')?.getAttribute('content') || '';
}

/**
 * The messages of a 422 that the API could not attach to a field: details.messages
 * holds every message, details.fields the ones it matched (several joined by a space).
 */
export function otherMessages(details) {
	const used = Object.values((details && details.fields) || {}).map(String).join('\n');
	return ((details && details.messages) || []).map(String).filter((m) => m && !used.includes(m));
}

function normalise(xhr, status) {
	const body = xhr.responseJSON && xhr.responseJSON.error ? xhr.responseJSON.error : {};
	return {
		status: xhr.status,
		code: body.code || (status === 'timeout' ? 'timeout' : xhr.status === 0 ? 'network' : 'error'),
		message: body.message || (status === 'timeout' ? 'The request timed out.' : xhr.status === 0 ? 'The firewall could not be reached.' : 'The request failed.'),
		fields: (body.details && body.details.fields) || null,
		messages: otherMessages(body.details)
	};
}

let waitingForSession = null;

function sessionBack() {
	if (!waitingForSession) {
		waitingForSession = new Promise((resolve) => {
			$(document).one('fs:session-restored', () => { waitingForSession = null; resolve(); });
			$(document).trigger('fs:session-expired');
		});
	}
	return waitingForSession;
}

/* Accepts '/api/v1/x', '/v1/x' and '/x' (all mean /api/v1/x). */
export function url(path, query) {
	if (path.startsWith('/v1/')) path = path.slice(3);
	let u = path.startsWith('/api/') ? path : config.base + path;
	if (query && Object.keys(query).length) u += (u.includes('?') ? '&' : '?') + $.param(query);
	return u;
}

export function request(method, path, body, opts = {}) {
	return new Promise((resolve, reject) => {
		$.ajax({
			url: url(path, opts.query),
			type: method,
			dataType: 'json',
			contentType: body !== undefined && body !== null ? 'application/json' : undefined,
			data: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
			headers: { 'X-CSRF-Token': csrf(), 'X-Requested-With': 'FreeSense-WebUI' },
			timeout: opts.timeout || config.timeout
		}).done((res) => resolve(res || {})).fail((xhr, status) => {
			if (xhr.status === 401 && !opts.noReauth) {
				sessionBack().then(() => request(method, path, body, { ...opts, noReauth: true }).then(resolve, reject));
				return;
			}
			reject(normalise(xhr, status));
		});
	});
}

/**
 * Upload a file (multipart/form-data) with progress:
 *   api.upload('/v1/system/backup/restore', file, { field: 'file', fields: {...}, onProgress: (pct) => … })
 */
export function upload(path, file, { field = 'file', fields = {}, query = null, onProgress = null, timeout = 0 } = {}) {
	const fd = new FormData();
	fd.append(field, file);
	for (const [k, v] of Object.entries(fields)) fd.append(k, v);
	return new Promise((resolve, reject) => {
		$.ajax({
			url: url(path, query),
			type: 'POST',
			data: fd,
			processData: false,
			contentType: false,
			dataType: 'json',
			timeout,
			headers: { 'X-CSRF-Token': csrf(), 'X-Requested-With': 'FreeSense-WebUI' },
			xhr() {
				const x = $.ajaxSettings.xhr();
				if (onProgress && x.upload) x.upload.addEventListener('progress', (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); });
				return x;
			}
		}).done((res) => resolve(res || {})).fail((xhr, status) => reject(normalise(xhr, status)));
	});
}

export const api = {
	config,
	url,
	request,
	get: (path, query, opts) => request('GET', path, null, { ...opts, query }),
	post: (path, body, opts) => request('POST', path, body ?? {}, opts),
	put: (path, body, opts) => request('PUT', path, body ?? {}, opts),
	patch: (path, body, opts) => request('PATCH', path, body ?? {}, opts),
	del: (path, opts) => request('DELETE', path, null, opts),
	upload
};
