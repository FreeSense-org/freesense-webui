/*
 * release-card.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * release-card — the Update Center's head: current version, build and
 * channel, the available update with its release notes (markdown-ish text
 * rendered safely as headings, paragraphs and list items), "Update now"
 * (confirm → POST → job id, emitted as fs:job-start for the job element),
 * "Check now" and the automatic check schedule. An optional gate (a
 * preflight element) must allow the update first. See spec.md.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { api } from '../../js/api.js';
import { batch } from '../../js/batch.js';
import { live } from '../../js/live.js';
import { states } from '../../js/states.js';
import { fmt } from '../../js/fmt.js';
import { t } from '../../js/i18n.js';
import { statusNode } from '../status/status.js';
import { badgeNode } from '../badge/badge.js';
import { toast } from '../toast/toast.js';
import { confirm } from '../confirm/confirm.js';
import { icon } from '../console/console.js';

/** Inline text with `code` spans; other markdown markers are dropped. Text only, never HTML. */
function inline(text) {
	const parts = String(text).replace(/\*\*|__/g, '').split('`');
	return parts.map((p, i) => (i % 2 ? $('<code>').text(p)[0] : document.createTextNode(p)));
}

/** Render markdown-ish notes (## headings, - / * lists, paragraphs) as safe DOM. */
export function notesNodes(md) {
	const out = [];
	let $list = null;
	for (const raw of String(md || '').split(/\r?\n/)) {
		const line = raw.trim();
		if (!line) { $list = null; continue; }
		const h = /^#{1,6}\s+(.*)$/.exec(line);
		const li = /^(?:[-*+]|\d+\.)\s+(.*)$/.exec(line);
		if (h) { $list = null; out.push($('<h4 class="fs-release-card-notes-h">').append(inline(h[1]))); }
		else if (li) {
			if (!$list) { $list = $('<ul class="fs-release-card-notes-list">'); out.push($list); }
			$list.append($('<li>').append(inline(li[1])));
		} else { $list = null; out.push($('<p class="fs-release-card-notes-p">').append(inline(line))); }
	}
	return out;
}

/**
 * The API's version (GET /v1/system/version) and system info (GET /v1/system/info)
 * as the card shows them.
 */
export function versionView(v, info) {
	v = v || {};
	info = info || {};
	return {
		product: info.product || 'FreeSense', version: v.running_version || info.version || '', build: v.installed_version || null,
		channel: v.channel || '', freebsd: info.freebsd || null, arch: info.platform || null,
		update: { available: !!v.update_available, latest: v.latest_version || '', status: v.status || null }
	};
}

el.define('release-card', {
	init(node, config, ctx) {
		const c = {
			title: 'FreeSense version', source: { path: '/v1/system/version' }, info: { path: '/v1/system/info' },
			changelog: { path: '/v1/system/update/changelog' },
			update: { method: 'POST', path: '/v1/system/firmware/update', body: { confirm: true } }, jobId: 'packages',
			check: { method: 'GET', path: '/v1/system/version', query: { refresh: 1 } },
			schedule: null, gate: null, channel: 'update', every: 0, ...config
		};
		const $node = $(node).addClass('fs-release-card').empty();
		const $head = $('<div class="fs-release-card-head">').append(
			$('<span class="fs-release-card-icon">').append(icon('arrows-rotate')),
			$('<h2 class="fs-release-card-title">').text(t(c.title)));
		const $body = $('<div class="fs-release-card-body">');
		$node.append($head, $body);

		let ver = null;
		let busyJob = false;
		let gate = null; /* last fs:preflight detail */
		let $update = null;
		let $hint = null;
		const evNs = `.fsrel${Math.random().toString(36).slice(2, 7)}`;

		function gateNode() { return c.gate ? document.querySelector(c.gate) : null; }
		function gateState() {
			const g = gateNode();
			const inst = g && el.get(g);
			if (!inst || typeof inst.verdict !== 'function') return gate;
			return inst.verdict() || gate;
		}

		function paintGate() {
			if (!$update) return;
			const g = c.gate ? gateState() : null;
			let hint = '';
			let blocked = false;
			if (busyJob) { blocked = true; hint = t('An update is running.'); }
			else if (c.gate && !g) { blocked = true; hint = t('Waiting for the checks before updating…'); }
			else if (g && !g.canProceed) { blocked = true; hint = g.busy || g.verdict === 'pending' ? t('Waiting for the checks before updating…') : t('Fix the problems found by the checks before updating.'); }
			$update.prop('disabled', blocked).attr('aria-describedby', hint ? `${node.id || 'fs-rel'}-hint` : null);
			$hint.text(hint).attr('id', `${node.id || 'fs-rel'}-hint`).prop('hidden', !hint);
		}

		function meta(v) {
			const u = v.update || {};
			const parts = [];
			if (u.checked) parts.push($('<span>').append(document.createTextNode(`${t('Last checked')} `), $('<time>').attr({ datetime: u.checked, title: fmt.datetime(u.checked) }).text(fmt.ago(u.checked))));
			const sched = u.schedule || c.schedule;
			if (sched) parts.push($('<span>').text(t('Automatic check: {when}', { when: t(sched) })));
			return $('<p class="fs-release-card-meta">').append(parts.flatMap((p, i) => (i ? [$('<span aria-hidden="true">').text(' · '), p] : [p])));
		}

		function loadNotes($box) {
			if (!c.changelog) return;
			states.loading($box, { lines: 4 });
			batch.get(c.changelog.path, c.changelog.query).then((r) => {
				const d = r.data || {};
				const nodes = notesNodes(typeof d === 'string' ? d : d.notes);
				if (!nodes.length) { $box.empty().append($('<p class="fs-release-card-notes-p fs-muted">').text(t('No release notes for this build.'))); return; }
				$box.empty();
				/* The notes say which build they describe (on development channels they can trail the offered update). */
				if (d.version) $box.append($('<p class="fs-release-card-notes-for fs-muted">').text(d.date ? t('Notes for {v}, published {d}', { v: d.version, d: fmt.datetime(d.date) }) : t('Notes for {v}', { v: d.version })));
				$box.append(nodes);
				if (d.url) $box.append($('<a class="fs-release-card-more" target="_blank" rel="noopener">').attr('href', d.url).append(document.createTextNode(`${t('Full release notes')} `), icon('arrow-up-right-from-square')));
			}, (e) => states.error($box, { message: e.message, compact: true, retry: () => loadNotes($box) }));
		}

		function render(v) {
			ver = v;
			if (!v) return false;
			const u = v.update || {};
			const dev = /dev/i.test(v.channel || '');
			const $current = $('<div class="fs-release-card-current">').append(
				$('<p class="fs-release-card-label">').text(t('Installed')),
				$('<p class="fs-release-card-version">').append($('<span class="fs-mono">').text(`${v.product || 'FreeSense'} ${v.version || ''}`.trim()),
					v.channel ? badgeNode({ label: t(dev ? 'Development' : v.channel.charAt(0).toUpperCase() + v.channel.slice(1)), tone: dev ? 'warn' : 'accent' }) : null),
				$('<dl class="fs-release-card-facts">').append(
					[[t('Build'), v.build], [t('Base'), v.freebsd ? `FreeBSD ${v.freebsd}` : null], [t('Architecture'), v.arch], [t('Boot environment'), v.boot_environment]]
						.filter(([, val]) => val)
						.map(([k, val]) => $('<div>').append($('<dt>').text(k), $('<dd class="fs-mono">').text(val)))));
			if (dev && c.devNote !== false) $current.append($('<p class="fs-release-card-dev">').append(icon('flask'), document.createTextNode(` ${t('Development builds are experimental and unsupported.')}`)));

			const $check = $('<button type="button" class="btn btn-secondary">').append(icon('magnifying-glass'), document.createTextNode(` ${t('Check now')}`)).on('click', () => checkNow($check));
			const $panel = $('<div class="fs-release-card-update">');
			$update = null;
			$hint = $('<p class="fs-release-card-hint" hidden>');
			if (u.available) {
				$update = $('<button type="button" class="btn btn-primary">').append(icon('download'), document.createTextNode(` ${t('Update now')}`)).on('click', () => updateNow());
				const $notes = $('<div class="fs-release-card-notes">');
				$panel.attr('data-state', 'available').append(
					$('<div class="fs-release-card-avail">').append(statusNode('info', t('Update available')), $('<p class="fs-release-card-latest fs-mono">').text(u.latest || '')),
					c.changelog ? $('<details class="fs-release-card-details" open>').append($('<summary>').text(t('Release notes')), $notes) : null,
					$('<div class="fs-release-card-actions">').append($update, $check), $hint);
				loadNotes($notes);
			} else {
				$panel.attr('data-state', 'current').append(
					$('<div class="fs-release-card-avail">').append(statusNode('ok', t('FreeSense is up to date'))),
					$('<div class="fs-release-card-actions">').append($check));
			}
			$panel.append(meta(v));
			$body.empty().append($current, $panel);
			paintGate();
			return true;
		}

		async function checkNow($btn) {
			$btn.prop('disabled', true).attr('aria-busy', 'true');
			try {
				const method = (c.check.method || 'GET').toUpperCase();
				const res = method === 'GET' ? await api.request('GET', api.url(c.check.path, c.check.query)) : await api.request(method, c.check.path, c.check.body || {});
				const d = versionView(res.data).update;
				const was = ver && ver.update && ver.update.available;
				ver = { ...ver, update: { ...(ver && ver.update), ...d } };
				toast(res.meta && res.meta.message ? res.meta.message : (d.available ? t('Update available') : t('FreeSense is up to date')), { level: d.available && !was ? 'info' : 'ok' });
				render(ver);
				$body.find('.fs-release-card-actions .btn-secondary').trigger('focus');
			} catch (e) {
				toast.error(e);
				$btn.prop('disabled', false).removeAttr('aria-busy');
			}
		}

		async function updateNow() {
			const g = c.gate ? gateState() : null;
			if (c.gate && (!g || !g.canProceed)) {
				toast(t('The checks must pass before updating.'), { level: 'warn' });
				const gn = gateNode();
				if (gn) gn.scrollIntoView({ block: 'center' });
				return;
			}
			const latest = (ver.update && ver.update.latest) || '';
			const ok = await confirm({
				title: t('Update to {v}?', { v: latest }),
				text: t(c.confirmText || 'FreeSense installs the update and restarts. Network traffic stops for a few minutes. A boot environment snapshot is created first, so you can roll back.'),
				confirmLabel: t('Update now'),
				icon: 'download'
			});
			if (!ok) return;
			$update.prop('disabled', true).attr('aria-busy', 'true');
			try {
				const res = await api.request((c.update.method || 'POST').toUpperCase(), c.update.path, c.update.body || {});
				/* The API answers 202 with the job id ("packages": the package operation / system update job). */
				const id = (res.data && (res.data.id || res.data.job)) || c.jobId;
				if (!id) throw { message: t('The server did not return a job.') };
				busyJob = true;
				$node.trigger('fs:job-start', [{ id, title: t('Update to {v}', { v: latest }), channel: c.channel }]);
			} catch (e) {
				toast.error(e);
			} finally { if ($update) $update.removeAttr('aria-busy'); paintGate(); }
		}

		$(document).on(`fs:preflight${evNs}`, (e, d) => {
			const g = gateNode();
			if (!g || !(e.target === g || g.contains(e.target))) return;
			gate = { ...d, busy: d.verdict === 'pending' };
			paintGate();
		}).on(`fs:job-state${evNs} fs:job-done${evNs} fs:job-closed${evNs}`, (e, d) => {
			if (e.type === 'fs:job-state') busyJob = d && d.state === 'running';
			else busyJob = false;
			paintGate();
			if ((e.type === 'fs:job-closed' || (e.type === 'fs:job-done' && d && d.state === 'succeeded')) && task) live.now(task.id);
		});

		const load = () => Promise.all([
			batch.get(c.source.path, c.source.query).then((r) => r.data),
			c.info ? batch.get(c.info.path, c.info.query).then((r) => r.data, () => null) : null
		]).then(([v, info]) => versionView(v, info));
		const task = states.load(ctx, $body, load, render, {
			every: c.every, lines: 5, empty: { icon: 'circle-info', title: t('No version information') }
		});

		return {
			/** Reload the version (and release notes). */
			reload() { live.now(task.id); },
			/** The last version payload. */
			version: () => ver,
			destroy() { $(document).off(evNs); }
		};
	}
});
