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
 *   POST   /api/v1/diagnostics/states/reset      reset the state table
 *   POST   /api/v1/gallery/feedback/fail         always 503
 *   GET    /api/v1/gallery/feedback/pending?set= demo pending set (starts pending; comes back 20 s after apply)
 *   POST   /api/v1/gallery/feedback/apply?set=   apply the demo set
 *   POST   /api/v1/gallery/feedback/discard?set= discard the demo set
 *   POST   /api/v1/gallery/feedback/apply-fail   503 with a filter reload error
 */
(function (M) {
	'use strict';

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
