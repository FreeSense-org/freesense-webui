/*
 * routes-ops.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Gallery mock routes for the logs & operations elements (log-viewer,
 * console, job, preflight, release-card, be-timeline):
 *
 *   POST   /api/v1/jobs/demo                        {title, steps, fail, outage: {step, seconds}, per} → {id}
 *   GET    /api/v1/jobs/{id}?after=<line>           state running|succeeded|failed, progress, step, log (cursor)
 *                                                    503 while a simulated outage (reboot) is running
 *   GET    /api/v1/gallery/ops/ping?run=&after=     ping output that grows over time (console)
 *   GET    /api/v1/gallery/ops/lines?count=         many lines at once (console limit)
 *   GET    /api/v1/gallery/ops/slow                 answers [] after 12 s (loading states)
 *   GET    /api/v1/system/update/changelog          release notes (markdown-ish text)
 *   POST   /api/v1/system/update/check              {available, latest, checked}
 *   POST   /api/v1/system/update                    starts the update job (with a reboot outage) → {id}
 *   GET    /api/v1/gallery/ops/version-current      a stable system that is up to date
 *   POST   /api/v1/gallery/ops/check-current        its "Check now"
 *   GET    /api/v1/system/update/preflight          checks; "packages" runs for ~3 s first
 *   GET    /api/v1/gallery/ops/preflight-fail       checks with a failure
 *   GET    /api/v1/system/boot-environments         boot environments and snapshots
 *   POST   /api/v1/system/boot-environments         snapshot now
 *   POST   /api/v1/system/boot-environments/{name}/activate
 *   PATCH  /api/v1/system/boot-environments/{name}  {name} rename (422 on invalid / duplicate)
 *   DELETE /api/v1/system/boot-environments/{name}  409 for the active / next-boot one
 *   GET    /api/v1/gallery/ops/be-many              many boot environments
 *
 * Jobs are kept in sessionStorage, so a job survives a page reload (as on a
 * real firewall). The routes-system.js job routes register after this file,
 * so the two overriding routes are kept at the front of the route table.
 */
(function (M) {
	'use strict';

	var T0 = Date.now();
	var KEY = 'fs-demo-ops-jobs';

	/* ------------------------------------------------- keep overrides first */

	var OVERRIDES = [];
	var baseRoute = M.route;
	function override(method, pattern, handler) {
		baseRoute.call(M, method, pattern, handler);
		OVERRIDES.push(M.routes[0]);
	}
	M.route = function () {
		baseRoute.apply(M, arguments);
		for (var i = OVERRIDES.length - 1; i >= 0; i--) {
			var at = M.routes.indexOf(OVERRIDES[i]);
			if (at > 0) { M.routes.splice(at, 1); M.routes.unshift(OVERRIDES[i]); }
		}
	};

	/* ------------------------------------------------------------------ jobs */

	function loadJobs() {
		try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
	}
	var jobs = loadJobs();
	function saveJobs() {
		try { sessionStorage.setItem(KEY, JSON.stringify(jobs)); } catch (e) { /* storage unavailable: jobs live until reload */ }
	}

	var UPDATE_STEPS = ['Checking for updates', 'Creating boot environment snapshot', 'Downloading packages (412 MiB)', 'Verifying signatures', 'Installing System packages', 'Updating Optional Packages', 'Rebooting', 'Finishing'];

	function createJob(b) {
		var id = 'j' + Math.random().toString(36).slice(2, 8);
		jobs[id] = {
			id: id, title: (b && b.title) || 'Demo job', started: Date.now(),
			steps: (b && b.steps) || UPDATE_STEPS.filter(function (s) { return s !== 'Rebooting'; }),
			fail: !!(b && b.fail), per: (b && b.per) || 2.5, outage: (b && b.outage) || null
		};
		saveJobs();
		return id;
	}

	function jobView(j, after, paused) {
		var elapsed = (Date.now() - j.started) / 1000 - (paused || 0);
		var per = j.per;
		var done = Math.min(j.steps.length, Math.floor(elapsed / per));
		var failAt = Math.min(3, j.steps.length - 1);
		var failed = j.fail && done >= failAt;
		if (failed) done = failAt;
		var lines = [];
		var add = function (at, text, level) { lines.push({ n: lines.length + 1, t: new Date(j.started + at * 1000).toISOString(), text: text, level: level }); };
		for (var i = 0; i < done + (done < j.steps.length && !failed ? 1 : 0); i++) {
			add(i * per, '>>> ' + j.steps[i] + '...');
			if (j.steps[i].indexOf('Downloading') === 0) {
				for (var k = 1; k <= 4; k++) if (i < done || elapsed > i * per + k * per / 5) add(i * per + k * per / 5, '    fetched ' + (k * 25) + '%');
			}
			if (i < done) add((i + 0.8) * per, 'done.');
		}
		if (failed) add(failAt * per + per * 0.6, 'ERROR: signature verification failed for FreeSense-system-1.1.0.pkg', 'error');
		var state = failed ? 'failed' : done >= j.steps.length ? 'succeeded' : 'running';
		var end = state === 'running' ? null : new Date(j.started + ((paused || 0) + (failed ? (failAt + 0.6) : j.steps.length) * per) * 1000).toISOString();
		return M.ok({
			id: j.id, title: j.title, state: state,
			progress: state === 'succeeded' ? 100 : Math.round(Math.min(0.99, elapsed / (per * j.steps.length)) * 100),
			step: j.steps[Math.min(done, j.steps.length - 1)], step_index: Math.min(done, j.steps.length - 1) + 1, steps: j.steps.length,
			started: new Date(j.started).toISOString(), finished: end,
			log: lines.filter(function (l) { return l.n > after; })
		}, { cursor: lines.length });
	}

	override('POST', '/api/v1/jobs/demo', function (p, q, b) { return M.ok({ id: createJob(b) }); });
	override('GET', '/api/v1/jobs/{id}', function (p, q) {
		var j = jobs[p.id];
		if (!j) return M.err(404, 'This job is no longer available.');
		/* Simulated reboot: the firewall answers 503 for outage.seconds after outage.step starts;
		 * the job's clock pauses meanwhile, so the reboot step lasts as long as the outage. */
		var paused = 0;
		if (j.outage) {
			var idx = j.steps.indexOf(j.outage.step);
			var from = j.started + (idx + 0.6) * j.per * 1000;
			if (idx >= 0 && Date.now() >= from) {
				if (Date.now() < from + j.outage.seconds * 1000) return M.err(503, 'The firewall is restarting.');
				paused = j.outage.seconds;
			}
		}
		return jobView(j, +q.get('after') || 0, paused);
	});

	/* ----------------------------------------------------------- ping (console) */

	var runs = {};
	var REPLIES = ['1.1.1.1', 'one.one.one.one'];
	M.route('GET', '/api/v1/gallery/ops/ping', function (p, q) {
		var run = q.get('run') || 'default';
		var count = +q.get('count') || 12;
		if (!runs[run]) runs[run] = Date.now();
		var sec = Math.floor((Date.now() - runs[run]) / 1000);
		var lines = ['PING ' + REPLIES[1] + ' (' + REPLIES[0] + '): 56 data bytes'];
		var rtts = [];
		for (var i = 0; i < Math.min(count, sec); i++) {
			var rtt = (8 + Math.abs(Math.sin(i * 1.7)) * 6).toFixed(3);
			rtts.push(+rtt);
			lines.push('64 bytes from ' + REPLIES[0] + ': icmp_seq=' + i + ' ttl=57 time=' + rtt + ' ms');
		}
		var done = sec > count;
		if (done) {
			var min = Math.min.apply(null, rtts), max = Math.max.apply(null, rtts);
			var avg = rtts.reduce(function (a, b) { return a + b; }, 0) / rtts.length;
			lines.push('', '--- ' + REPLIES[1] + ' ping statistics ---', count + ' packets transmitted, ' + count + ' packets received, 0.0% packet loss',
				'round-trip min/avg/max/stddev = ' + min.toFixed(3) + '/' + avg.toFixed(3) + '/' + max.toFixed(3) + '/1.204 ms');
		}
		var after = +q.get('after') || 0;
		var out = lines.map(function (text, n) { return { n: n + 1, text: text }; }).filter(function (l) { return l.n > after; });
		return M.ok({ lines: out, done: done }, { cursor: lines.length });
	});

	/* Many lines at once (console line limit). */
	M.route('GET', '/api/v1/gallery/ops/lines', function (p, q) {
		var n = Math.min(+q.get('count') || 300, 5000);
		var out = [];
		for (var i = 1; i <= n; i++) out.push({ n: i, t: new Date(T0 + i * 1000).toISOString(), text: '[' + i + '/' + n + '] Extracting FreeSense-system-1.1.0: /usr/local/www/file-' + i + '.php', level: i % 97 === 0 ? 'warn' : null });
		return M.ok({ lines: out, done: true }, { cursor: n });
	});

	/* A source that never answers in time (loading states). */
	M.route('GET', '/api/v1/gallery/ops/slow', function () { return Object.assign(M.ok([], { last_id: 0 }), { delay: 12000 }); });

	/* ---------------------------------------------------------------- update */

	var update = { available: true, latest: '1.1.0-DEVELOPMENT 20261009-0100', checked: new Date(T0 - 40 * 60000).toISOString(), schedule: 'Daily at 06:00 UTC' };
	var NOTES = [
		'## System',
		'- WebUI: the Update Center shows boot environments as a timeline',
		'- Gateways: dpinger restarts cleanly after a WAN address change',
		'- Firewall: `pf` tables reload without dropping established states',
		'',
		'## Security',
		'- OpenSSL 3.5.4 (fixes two moderate issues)',
		'- **unbound** 1.24.1',
		'',
		'## Optional Packages',
		'- CrowdSec 1.7.2: faster decisions sync',
		'- Suricata 8.0.1 with updated rules loader',
		'',
		'<script>alert(1)</script> is shown as text, never run.'
	].join('\n');

	M.route('GET', '/api/v1/system/update/changelog', function () {
		return M.ok({ version: update.latest, date: '2026-10-09', notes: NOTES, url: 'https://www.freesense.org/releases/' });
	});
	M.route('POST', '/api/v1/system/update/check', function () {
		update.checked = new Date().toISOString();
		return M.ok(update, { message: update.available ? 'Update available: ' + update.latest : 'FreeSense is up to date' });
	});
	M.route('GET', '/api/v1/system/update/status', function () { return M.ok(update); });
	var stable = { checked: new Date(T0 - 5 * 3600000).toISOString(), schedule: 'Daily at 06:00 UTC' };
	M.route('GET', '/api/v1/gallery/ops/version-current', function () {
		return M.ok({ product: 'FreeSense', version: '1.0.1-RELEASE', build: '20260921-1200', channel: 'stable', arch: 'amd64', freebsd: '15.0-RELEASE-p2', boot_environment: 'default',
			update: { available: false, latest: '1.0.1-RELEASE', checked: stable.checked, schedule: stable.schedule } });
	});
	M.route('POST', '/api/v1/gallery/ops/check-current', function () {
		stable.checked = new Date().toISOString();
		return M.ok({ available: false, latest: '1.0.1-RELEASE', checked: stable.checked }, { message: 'FreeSense is up to date' });
	});
	M.route('POST', '/api/v1/system/update', function () {
		var id = createJob({ title: 'Update to ' + update.latest, steps: UPDATE_STEPS, per: 2.5, outage: { step: 'Rebooting', seconds: 10 } });
		return M.ok({ id: id }, { message: 'Update started' });
	});

	/* ------------------------------------------------------------- preflight */

	var preflightStart = null;
	M.route('GET', '/api/v1/system/update/preflight', function () {
		if (!preflightStart) preflightStart = Date.now();
		var running = Date.now() - preflightStart < 3000;
		return M.ok([
			{ id: 'disk', label: 'Free disk space', state: 'pass', detail: '96.4 GiB free, 1.2 GiB needed' },
			{ id: 'be', label: 'Boot environment support', state: 'pass', detail: 'ZFS pool zroot; a snapshot is created before the update' },
			{ id: 'config', label: 'Configuration writable', state: 'pass', detail: '/conf/config.xml (last saved 3 hours ago)' },
			running ? { id: 'packages', label: 'Optional Packages compatible', state: 'running', detail: 'Checking 9 packages against the new release…' }
				: { id: 'packages', label: 'Optional Packages compatible', state: 'warn', detail: '2 packages will be reinstalled: CrowdSec, Suricata', help: '/gallery/app/system/packages' },
			{ id: 'signing', label: 'Repository signature', state: 'pass', detail: 'Development key, fingerprint 6F:1C:…:A2' }
		]);
	});
	M.route('GET', '/api/v1/gallery/ops/preflight-fail', function () {
		return M.ok({ checks: [
			{ id: 'disk', label: 'Free disk space', state: 'fail', detail: '310 MiB free on /, 1.2 GiB needed. Remove old boot environments or logs.' },
			{ id: 'be', label: 'Boot environment support', state: 'warn', detail: 'UFS install: no rollback snapshot is possible' },
			{ id: 'config', label: 'Configuration writable', state: 'pass', detail: '/conf/config.xml' },
			{ id: 'packages', label: 'Optional Packages compatible', state: 'pass', detail: '9 packages' }
		] });
	});

	/* ---------------------------------------------------- boot environments */

	var DAY = 86400000;
	var bes = [
		{ name: 'default', kind: 'be', active: true, next_boot: true, version: '1.1.0-DEVELOPMENT 20261008-0100', created: new Date(T0 - 20 * 3600000).toISOString(), size: 4.1e9, description: 'Running system' },
		{ name: 'default@2026-10-08-update', kind: 'snapshot', parent: 'default', version: '1.1.0-DEVELOPMENT 20261007-0100', created: new Date(T0 - 1 * DAY - 3 * 3600000).toISOString(), size: 2.3e8, description: 'Before update to 20261008' },
		{ name: '20261007-0100', kind: 'be', version: '1.1.0-DEVELOPMENT 20261007-0100', created: new Date(T0 - 3 * DAY).toISOString(), size: 3.9e9, description: 'Previous version' },
		{ name: '20261003-0100', kind: 'be', version: '1.1.0-DEVELOPMENT 20261003-0100', created: new Date(T0 - 6 * DAY).toISOString(), size: 3.8e9 },
		{ name: 'default@manual-before-vlan', kind: 'snapshot', parent: 'default', version: '1.1.0-DEVELOPMENT 20261003-0100', created: new Date(T0 - 7 * DAY).toISOString(), size: 6.1e7, description: 'Manual snapshot' },
		{ name: '1.0.1-RELEASE', kind: 'be', version: '1.0.1-RELEASE', created: new Date(T0 - 40 * DAY).toISOString(), size: 3.6e9, description: 'Stable line (cannot be activated after upgrading to 1.1)', locked: true }
	];
	function findBe(name) { return bes.find(function (b) { return b.name === name; }); }

	M.route('GET', '/api/v1/system/boot-environments', function () { return M.ok(bes, { pool: 'zroot', free: 9.64e10 }); });
	M.route('POST', '/api/v1/system/boot-environments', function (p, q, b) {
		var d = new Date();
		var name = 'default@' + ((b && b.name) || ('manual-' + d.toISOString().slice(0, 16).replace(/[-:T]/g, '')));
		if (findBe(name)) return M.err(409, 'A snapshot named ' + name + ' already exists.');
		var act = bes.find(function (x) { return x.active; });
		bes.unshift({ name: name, kind: 'snapshot', parent: act ? act.name : 'default', version: act ? act.version : '', created: d.toISOString(), size: 1.2e6, description: 'Manual snapshot' });
		return M.ok(bes[0], { message: 'Snapshot ' + name + ' created' });
	});
	M.route('POST', '/api/v1/system/boot-environments/{name}/activate', function (p) {
		var be = findBe(p.name);
		if (!be) return M.err(404, 'Boot environment not found');
		if (be.locked) return M.err(409, 'A 1.0 boot environment cannot be activated on a 1.1 system (one-way upgrade).');
		if (be.kind === 'snapshot') {
			/* Rolling back to a snapshot creates a new boot environment from it. */
			var nb = { name: p.name.replace(/^.*@/, 'rollback-'), kind: 'be', version: be.version, created: new Date().toISOString(), size: be.size, description: 'Created from snapshot ' + p.name };
			bes.unshift(nb);
			be = nb;
		}
		bes.forEach(function (x) { x.next_boot = false; });
		be.next_boot = true;
		return M.ok(be, { message: be.name + ' will be used at the next boot' });
	});
	M.route('PATCH', '/api/v1/system/boot-environments/{name}', function (p, q, b) {
		var be = findBe(p.name);
		if (!be) return M.err(404, 'Boot environment not found');
		var name = String((b && b.name) || '').trim();
		var prefix = be.kind === 'snapshot' ? be.name.replace(/@.*$/, '@') : '';
		if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)) return M.err(422, 'Fix the highlighted fields.', { name: 'Use letters, digits, dots, dashes and underscores (max. 64).' });
		if (findBe(prefix + name) && prefix + name !== be.name) return M.err(422, 'Fix the highlighted fields.', { name: 'This name is already in use.' });
		be.name = prefix + name;
		return M.ok(be, { message: 'Renamed to ' + be.name });
	});
	M.route('DELETE', '/api/v1/system/boot-environments/{name}', function (p) {
		var be = findBe(p.name);
		if (!be) return M.err(404, 'Boot environment not found');
		if (be.active || be.next_boot) return M.err(409, 'The active or next-boot environment cannot be deleted.');
		bes = bes.filter(function (x) { return x !== be; });
		return M.ok(null, { message: p.name + ' deleted' });
	});
	M.route('GET', '/api/v1/gallery/ops/be-many', function () {
		var out = [];
		for (var i = 0; i < 18; i++) {
			var d = new Date(T0 - i * 2 * DAY);
			var tag = d.toISOString().slice(0, 10).replace(/-/g, '') + '-0100';
			out.push({ name: i === 0 ? 'default' : tag, kind: 'be', active: i === 0, next_boot: i === 0, version: '1.1.0-DEVELOPMENT ' + tag, created: d.toISOString(), size: 3.5e9 + i * 1e8 });
			if (i % 3 === 0) out.push({ name: 'default@auto-' + tag, kind: 'snapshot', parent: 'default', version: '1.1.0-DEVELOPMENT ' + tag, created: new Date(d.getTime() - 3600000).toISOString(), size: 4e7 + i * 1e6, description: 'Automatic snapshot before update with a long description that wraps onto the next line on phones' });
		}
		return M.ok(out);
	});
})(window.FSMock);
