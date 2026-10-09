/*
 * routes-system.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/* Gallery mock routes: current user, profile, preferences, sessions, version (the product API's shapes). */
(function (M) {
	'use strict';

	/*
	 * Shapes are the product API's (freesense routes_me.inc, routes_v1.inc):
	 * GET /v1/me is the API whoami; the WebUI profile is /v1/me/profile and
	 * the appearance /v1/me/preferences.
	 */
	var T0 = Date.now();
	var iso = function (ms) { return new Date(ms).toISOString().replace(/\.\d+Z$/, '+00:00'); };
	var profile = {
		username: 'admin',
		name: 'Alex Morgan',
		email: 'admin@example.org',
		initials: 'AM',
		local: true,
		groups: ['admins'],
		admin: true,
		signed_in: iso(T0 - 2 * 3600000)
	};
	var prefs = { theme: 'freesense', mode: 'auto', accent: 'coral', density: 'comfortable', start_page: '/' };
	var CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
	var sessions = [
		{ id: 'e1fcb11f8cc191be', current: true, address: '192.168.1.31', agent: CHROME, authsource: 'Local Database', signed_in: iso(T0 - 2 * 3600000), last_seen: iso(T0) },
		{ id: '02e8a223da34253a', current: false, address: '192.168.1.55', agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
			authsource: 'Local Database', signed_in: iso(T0 - 30 * 3600000), last_seen: iso(T0 - 4 * 3600000) },
		{ id: '7a90c3d1e2f40b5a', current: false, address: '10.8.0.6', agent: 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
			authsource: 'LDAP/corp', signed_in: iso(T0 - 3 * 86400000), last_seen: iso(T0 - 20 * 3600000) }
	];
	var version = { running_version: '1.1.0-DEVELOPMENT', installed_version: '1.1.0.a.20261008.0100', latest_version: '1.1.0.a.20261009.0100',
		update_available: true, status: 'update_available', channel: 'devel' };

	M.route('GET', '/api/v1/me', function () {
		return M.ok({ user: 'admin', key: { id: 'session', description: 'WebUI session', readonly: false, expires: null, limited_to_scopes: false },
			admin: true, config_readonly: false, effective_scopes: ['*'], endpoints: [] });
	});
	M.route('GET', '/api/v1/me/profile', function () { return M.ok(profile); });
	M.route('PUT', '/api/v1/me/profile', function (p, q, b) {
		b = b || {};
		var fields = {};
		Object.keys(b).forEach(function (k) { if (k !== 'name' && k !== 'email') fields[k] = 'Unknown field.'; });
		if (typeof b.name === 'string' && b.name.length > 64) fields.name = 'Enter a name of up to 64 characters.';
		if (b.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) fields.email = 'Enter a valid email address.';
		if (Object.keys(fields).length) return M.err(422, 'The request failed validation.', fields);
		if ('name' in b) profile.name = b.name;
		if ('email' in b) profile.email = b.email;
		var words = (profile.name || profile.username).trim().split(/\s+/);
		profile.initials = (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2)).toUpperCase();
		return M.ok(profile);
	});
	M.route('GET', '/api/v1/me/preferences', function () { return M.ok(prefs); });
	M.route('PUT', '/api/v1/me/preferences', function (p, q, b) { Object.assign(prefs, b || {}); return M.ok(prefs); });
	M.route('GET', '/api/v1/me/sessions', function () { return M.ok(sessions); });
	M.route('DELETE', '/api/v1/me/sessions/{id}', function (p) {
		var s = sessions.find(function (x) { return x.id === p.id; });
		if (!s) return M.err(404, 'Session not found');
		if (s.current) return M.err(409, 'You cannot sign out your current session here. Use Sign out.');
		sessions = sessions.filter(function (x) { return x.id !== p.id; });
		return M.ok({ revoked: p.id });
	});
	M.route('POST', '/api/v1/me/signout', function () { return M.ok({ signed_out: true }); });
	M.route('GET', '/api/v1/system/version', function () { return M.ok(version); });

	/* Jobs (/v1/jobs/*) live in routes-ops.js. */
})(window.FSMock);
