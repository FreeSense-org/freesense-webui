/*
 * routes-system.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/* Gallery mock routes: current user, preferences, sessions, version, update, jobs. */
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
	var jobs = {};

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

	/* Jobs: long operations with a log cursor (?after=<line>). */
	M.route('POST', '/api/v1/jobs/demo', function (p, q, b) {
		var id = 'j' + Math.random().toString(36).slice(2, 8);
		var steps = (b && b.steps) || ['Checking for updates', 'Creating boot environment snapshot', 'Downloading packages (412 MiB)', 'Verifying signatures', 'Installing System packages', 'Updating Optional Packages', 'Finishing'];
		jobs[id] = { id: id, title: (b && b.title) || 'Demo job', started: Date.now(), steps: steps, fail: !!(b && b.fail) };
		return M.ok({ id: id });
	});
	M.route('GET', '/api/v1/jobs/{id}', function (p, q) {
		var j = jobs[p.id];
		if (!j) return M.err(404, 'Job not found');
		var elapsed = (Date.now() - j.started) / 1000;
		var per = 2.5;
		var done = Math.min(j.steps.length, Math.floor(elapsed / per));
		var failed = j.fail && done >= 3;
		if (failed) done = 3;
		var lines = [];
		for (var i = 0; i < done + (done < j.steps.length && !failed ? 1 : 0); i++) {
			lines.push({ n: lines.length + 1, t: new Date(j.started + i * per * 1000).toISOString(), text: '>>> ' + j.steps[i] + '...' });
			if (i < done) lines.push({ n: lines.length + 1, t: new Date(j.started + (i + 0.8) * per * 1000).toISOString(), text: 'done.' });
		}
		if (failed) lines.push({ n: lines.length + 1, t: new Date().toISOString(), text: 'ERROR: signature verification failed for FreeSense-system-1.1.0.pkg', level: 'error' });
		var after = +q.get('after') || 0;
		var state = failed ? 'failed' : done >= j.steps.length ? 'succeeded' : 'running';
		return M.ok({
			id: j.id, title: j.title, state: state, progress: Math.round(Math.min(1, elapsed / (per * j.steps.length)) * 100),
			step: j.steps[Math.min(done, j.steps.length - 1)], steps: j.steps.length, started: new Date(j.started).toISOString(),
			log: lines.filter(function (l) { return l.n > after; })
		}, { cursor: lines.length });
	});
})(window.FSMock);
