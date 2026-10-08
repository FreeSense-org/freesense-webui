/*
 * routes-system.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/* Gallery mock routes: current user, preferences, sessions, version. */
(function (M) {
	'use strict';

	var T0 = Date.now();
	var me = {
		username: 'admin',
		name: 'Alex Morgan',
		email: 'admin@example.org',
		role: 'Administrator',
		groups: ['admins'],
		avatar: null,
		initials: 'AM',
		color: 'coral',
		language: 'en',
		start_page: '/',
		last_login: new Date(T0 - 26 * 3600000).toISOString(),
		created: '2025-11-03T09:12:00Z'
	};
	var prefs = { theme: 'freesense', mode: 'auto', accent: 'coral', density: 'comfortable' };
	var sessions = [
		{ id: 's1', current: true, ip: '192.168.1.31', agent: 'Chrome 141 on Windows', started: new Date(T0 - 2 * 3600000).toISOString(), last_seen: new Date(T0).toISOString() },
		{ id: 's2', current: false, ip: '192.168.1.55', agent: 'Safari on iPhone', started: new Date(T0 - 30 * 3600000).toISOString(), last_seen: new Date(T0 - 4 * 3600000).toISOString() },
		{ id: 's3', current: false, ip: '10.8.0.6', agent: 'Firefox 140 on Linux (VPN)', started: new Date(T0 - 3 * 86400000).toISOString(), last_seen: new Date(T0 - 20 * 3600000).toISOString() }
	];
	var version = {
		product: 'FreeSense', version: '1.1.0-DEVELOPMENT', build: '20261008-0100', channel: 'development', arch: 'amd64',
		freebsd: '16.0-CURRENT', boot_environment: 'default', update: { available: true, latest: '1.1.0-DEVELOPMENT 20261009-0100', checked: new Date(T0 - 40 * 60000).toISOString() }
	};

	M.route('GET', '/api/v1/me', function () { return M.ok(Object.assign({}, me, { preferences: prefs })); });
	M.route('PUT', '/api/v1/me/profile', function (p, q, b) {
		var fields = {};
		if (!b.name || b.name.length > 64) fields.name = 'Enter a name of up to 64 characters.';
		if (b.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) fields.email = 'Enter a valid email address.';
		if (Object.keys(fields).length) return M.err(422, 'Fix the highlighted fields.', fields);
		Object.assign(me, { name: b.name, email: b.email || '', language: b.language || me.language, start_page: b.start_page || me.start_page });
		me.initials = me.name.split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
		return M.ok(me, { message: 'Profile saved' });
	});
	M.route('GET', '/api/v1/me/preferences', function () { return M.ok(prefs); });
	M.route('PUT', '/api/v1/me/preferences', function (p, q, b) { Object.assign(prefs, b || {}); return M.ok(prefs); });
	M.route('GET', '/api/v1/me/sessions', function () { return M.ok(sessions); });
	M.route('DELETE', '/api/v1/me/sessions/{id}', function (p) {
		var s = sessions.find(function (x) { return x.id === p.id; });
		if (!s) return M.err(404, 'Session not found');
		if (s.current) return M.err(409, 'You cannot sign out your current session here. Use Sign out.');
		sessions = sessions.filter(function (x) { return x.id !== p.id; });
		return M.ok(null, { message: 'Session signed out' });
	});
	M.route('GET', '/api/v1/system/version', function () { return M.ok(version); });

	/* Jobs (/v1/jobs/*) live in routes-ops.js. */
})(window.FSMock);
