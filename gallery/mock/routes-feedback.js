/*
 * routes-feedback.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Gallery mock routes for the feedback elements (toast, confirm,
 * danger-confirm, modal-form, drawer, apply-bar):
 *   POST   /api/v1/firewall/aliases              create (422 on invalid values; WEB_SERVERS exists)
 *   DELETE /api/v1/firewall/aliases/{name}       delete (marks firewall changes pending)
 *   POST   /api/v1/diagnostics/states/reset      reset the state table
 *   POST   /api/v1/gallery/feedback/fail         always 503
 *   GET    /api/v1/gallery/feedback/pending?set= demo pending set (starts pending; comes back 20 s after apply)
 *   POST   /api/v1/gallery/feedback/apply?set=   apply the demo set
 *   POST   /api/v1/gallery/feedback/discard?set= discard the demo set
 *   POST   /api/v1/gallery/feedback/apply-fail   503 with a filter reload error
 */
(function (M) {
	'use strict';

	var NAMES = ['ADMIN_HOSTS', 'DNS_SERVERS', 'MAIL_PORTS', 'SSH_ADMIN', 'RFC1918_ALL', 'CROWDSEC_BLOCKLIST', 'THREAT_FEEDS', 'WEB_SERVERS'];

	/* Mark the core firewall as having pending changes (the core keeps that flag private). */
	function firewallPending() {
		var rules = M.dispatch('GET', '/api/v1/firewall/rules', new URLSearchParams('interface=lan'), null).body.data || [];
		var r = rules.find(function (x) { return !x.system; });
		if (r) M.dispatch('PATCH', '/api/v1/firewall/rules/' + r.id, new URLSearchParams(), {});
	}

	var ipv4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}(\/([12]?\d|3[0-2]))?$/;
	var port = /^\d{1,5}(:\d{1,5})?$/;

	M.route('POST', '/api/v1/firewall/aliases', function (p, q, b) {
		b = b || {};
		var e = {};
		var name = String(b.name || '');
		if (!/^[A-Za-z][A-Za-z0-9_]{0,30}$/.test(name)) e.name = 'Use letters, digits and underscores, starting with a letter (max. 31).';
		else if (NAMES.indexOf(name.toUpperCase()) >= 0) e.name = 'An alias named ' + name + ' already exists.';
		if (['host', 'network', 'port'].indexOf(b.type) < 0) e.type = 'Choose a type.';
		var entries = String(b.content || '').split(/[\s,]+/).filter(Boolean);
		if (!entries.length) e.content = 'Add at least one entry.';
		else {
			var bad = entries.filter(function (x) { return b.type === 'port' ? !port.test(x) : !ipv4.test(x); });
			if (bad.length) e.content = (b.type === 'port' ? 'Not a port or range: ' : 'Not a valid IPv4 address or network: ') + bad.join(', ');
		}
		if (b.ttl != null && (b.ttl < 60 || b.ttl > 86400)) e.ttl = 'Use 60 to 86400 seconds.';
		if (Object.keys(e).length) return M.err(422, 'Fix the highlighted fields.', e);
		NAMES.push(name.toUpperCase());
		firewallPending();
		return M.ok({ name: name, type: b.type, count: entries.length }, { message: 'Alias ' + name + ' created', pending: true });
	});

	M.route('DELETE', '/api/v1/firewall/aliases/{name}', function (p) {
		var i = NAMES.indexOf(p.name);
		if (i < 0) return M.err(404, 'Alias ' + p.name + ' does not exist.');
		if (p.name === 'RFC1918_ALL') return M.err(409, 'RFC1918_ALL is used by 2 rules (GUEST, IOT) and cannot be deleted.');
		NAMES.splice(i, 1);
		firewallPending();
		return M.ok(null, { message: 'Alias ' + p.name + ' deleted', pending: true });
	});

	M.route('POST', '/api/v1/diagnostics/states/reset', function () {
		return M.ok({ removed: 18420 }, { message: 'State table reset: 18,420 states removed' });
	});

	M.route('POST', '/api/v1/gallery/feedback/fail', function () { return M.err(503, 'The firewall is busy applying another change. Try again in a moment.'); });

	var sets = {};
	function set(q) {
		var k = q.get('set') || 'default';
		if (!sets[k]) sets[k] = { pending: true, count: k === 'one' ? 1 : 3 };
		return sets[k];
	}
	function later(s) { setTimeout(function () { s.pending = true; s.count = 2; }, 20000); }
	M.route('GET', '/api/v1/gallery/feedback/pending', function (p, q) { var s = set(q); return M.ok({ pending: s.pending, count: s.pending ? s.count : 0 }); });
	M.route('POST', '/api/v1/gallery/feedback/apply', function (p, q) {
		var s = set(q);
		s.pending = false; later(s);
		return M.ok({ pending: false }, { message: 'Firewall rules reloaded' });
	});
	M.route('POST', '/api/v1/gallery/feedback/discard', function (p, q) {
		var s = set(q);
		s.pending = false; later(s);
		return M.ok({ pending: false }, { message: s.count + ' pending changes discarded' });
	});
	M.route('POST', '/api/v1/gallery/feedback/apply-fail', function () {
		return M.err(503, 'Filter reload failed: /tmp/rules.debug:42: syntax error. The previous ruleset is still active.');
	});
})(window.FSMock);
