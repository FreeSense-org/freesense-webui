/*
 * routes-identity.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Gallery mock routes for the identity and shell-tool elements.
 *   DELETE /api/v1/notices                              dismiss all notices
 *   POST   /api/v1/gallery/identity/notice              add a notice (try it from the console)
 *   GET    /api/v1/gallery/identity/notices-many        many notices with long text
 *   GET    /api/v1/gallery/identity/me-long             a user with long name, email and many groups
 *   GET    /api/v1/gallery/identity/sessions-many       many sessions
 *   GET    /api/v1/gallery/identity/flaky/{what}        first answer ok, later 503 (stale states)
 *   DELETE /api/v1/gallery/identity/sessions/{id}       ok (revoke in fixtures)
 *   DELETE /api/v1/gallery/identity/fail/{id}           503 (rollback in fixtures)
 */
(function (M) {
	'use strict';

	var T0 = Date.now();
	var ago = function (min) { return new Date(T0 - min * 60000).toISOString(); };
	var noticeSeq = 100;

	/* The core keeps the notices; its GET hands out the live array. */
	function notices() { return M.dispatch('GET', '/api/v1/notices', new URLSearchParams(), null).body.data; }

	M.route('DELETE', '/api/v1/notices', function () {
		notices().splice(0);
		return M.ok(null, { message: 'All notices dismissed' });
	});
	M.route('POST', '/api/v1/gallery/identity/notice', function (p, q, b) {
		b = b || {};
		var n = { id: ++noticeSeq, level: b.level || 'info', title: b.title || 'Configuration backup finished', body: b.body || 'A backup of the configuration was written to /cf/conf/backup.', time: new Date().toISOString(), link: b.link || null };
		notices().unshift(n);
		return M.ok(n);
	});

	var MANY = [];
	var levels = ['danger', 'warning', 'info', 'success'];
	for (var i = 0; i < 14; i++) {
		MANY.push({
			id: 'm' + i, level: levels[i % 4], time: ago(7 + i * 53),
			title: i === 0 ? 'Gateway group FAILOVER_WAN_WITH_A_VERY_LONG_NAME_FOR_TESTING is running degraded on every member' : 'Notice ' + (i + 1) + ': ' + ['Package update available', 'Interface igc3 changed state', 'Certificate renewed', 'Disk usage above 80%'][i % 4],
			body: i === 0 ? 'Monitor 8.8.8.8 has been unreachable for 41 minutes and monitor 1.1.1.1 shows 12% packet loss. Traffic that uses the group falls back to the remaining member until both recover. Check the gateway log for details.' : 'Details for notice ' + (i + 1) + '.',
			link: i % 3 === 0 ? '/gallery/app/insights/gateways' : null
		});
	}
	M.route('GET', '/api/v1/gallery/identity/notices-many', function () { return M.ok(MANY); });

	M.route('GET', '/api/v1/gallery/identity/me-long', function () {
		return M.ok({
			username: 'maximiliane.vandenberghe-oosterhuis', name: 'Maximiliane Alexandra van den Berghe-Oosterhuis',
			email: 'maximiliane.alexandra.vandenberghe-oosterhuis@network-operations.example.org',
			role: 'Read-only auditor', groups: ['auditors', 'noc-amsterdam', 'noc-copenhagen', 'vpn-users', 'change-advisory-board'],
			avatar: null, language: 'nl', start_page: '/gallery/app/insights/logs',
			last_login: ago(3 * 1440), created: '2024-02-14T08:00:00Z'
		});
	});

	var AGENTS = ['Chrome 141 on Windows', 'Safari on iPhone', 'Firefox 140 on Linux (VPN)', 'Edge 141 on Windows', 'Safari on iPad', 'curl/8.9 (API token: monitoring)', 'Chrome 141 on Android', 'Firefox 140 on macOS', 'Chrome 141 on ChromeOS'];
	var MANYS = AGENTS.map(function (a, n) {
		return { id: 'g' + n, current: n === 0, ip: n === 2 ? '10.8.0.6' : n === 5 ? '2001:db8:24::1f3a' : '192.168.1.' + (31 + n * 7), agent: a, started: ago(120 + n * 900), last_seen: ago(n * 75) };
	});
	M.route('GET', '/api/v1/gallery/identity/sessions-many', function () { return M.ok(MANYS); });
	M.route('DELETE', '/api/v1/gallery/identity/sessions/{id}', function (p) {
		MANYS = MANYS.filter(function (s) { return s.id !== p.id; });
		return M.ok(null, { message: 'Session signed out' });
	});
	M.route('DELETE', '/api/v1/gallery/identity/fail/{id}', function () { return M.err(503, 'The session service is not responding (simulated).'); });

	/* First answer ok, every later one fails: shows the stale state after a refresh. */
	var flakyCalls = {};
	M.route('GET', '/api/v1/gallery/identity/flaky/{what}', function (p) {
		flakyCalls[p.what] = (flakyCalls[p.what] || 0) + 1;
		if (flakyCalls[p.what] > 1) return M.err(503, 'Lost contact with the firewall (simulated).');
		var path = { me: '/api/v1/me', sessions: '/api/v1/me/sessions', notices: '/api/v1/notices' }[p.what];
		return path ? M.dispatch('GET', path, new URLSearchParams(), null) : M.err(404, 'Unknown flaky source');
	});
})(window.FSMock);
