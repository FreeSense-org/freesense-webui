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

function normalise(xhr, status) {
	const body = xhr.responseJSON && xhr.responseJSON.error ? xhr.responseJSON.error : {};
	return {
		status: xhr.status,
		code: body.code || (status === 'timeout' ? 'timeout' : xhr.status === 0 ? 'network' : 'error'),
		message: body.message || (status === 'timeout' ? 'The request timed out.' : xhr.status === 0 ? 'The firewall could not be reached.' : 'The request failed.'),
		fields: (body.details && body.details.fields) || null
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

export const api = {
	config,
	url,
	request,
	get: (path, query, opts) => request('GET', path, null, { ...opts, query }),
	post: (path, body, opts) => request('POST', path, body ?? {}, opts),
	put: (path, body, opts) => request('PUT', path, body ?? {}, opts),
	patch: (path, body, opts) => request('PATCH', path, body ?? {}, opts),
	del: (path, opts) => request('DELETE', path, null, opts)
};
