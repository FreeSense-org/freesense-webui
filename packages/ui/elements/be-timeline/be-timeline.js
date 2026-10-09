/*
 * be-timeline.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * be-timeline — boot environments and snapshots as a vertical timeline,
 * newest first: the active one, the one used at the next boot, previous
 * versions and snapshots with dates and sizes. Actions: activate / roll back
 * (confirm), snapshot now, rename (modal form) and delete (type-to-confirm).
 * See spec.md.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { api } from '../../js/api.js';
import { batch } from '../../js/batch.js';
import { live } from '../../js/live.js';
import { states } from '../../js/states.js';
import { fmt } from '../../js/fmt.js';
import { t } from '../../js/i18n.js';
import { badgeNode } from '../badge/badge.js';
import { menuNode, disposeMenus } from '../page-header/actions.js';
import { toast } from '../toast/toast.js';
import { confirm } from '../confirm/confirm.js';
import { dangerConfirm } from '../danger-confirm/danger-confirm.js';
import { modalForm } from '../modal-form/modal-form.js';
import { icon } from '../console/console.js';

const fill = (path, name) => path.replace('{name}', encodeURIComponent(name));

/* created: unix seconds (the API) or an ISO date → ISO date. */
function whenOf(v) {
	if (v == null || v === '') return null;
	return typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v).toISOString() : String(v);
}

el.define('be-timeline', {
	init(node, config, ctx) {
		const base = '/v1/system/boot-environments';
		const c = {
			title: 'Boot environments', source: { path: base }, every: 0, readOnly: false,
			paths: { activate: `${base}/{name}/activate`, snapshot: base, rename: `${base}/{name}`, remove: `${base}/{name}` },
			...config
		};
		c.paths = { activate: `${base}/{name}/activate`, snapshot: base, rename: `${base}/{name}`, remove: `${base}/{name}`, ...(config.paths || {}) };
		const $node = $(node).addClass('fs-be-timeline').empty();
		const $sub = $('<p class="fs-be-timeline-sub">');
		const $snap = $('<button type="button" class="btn btn-secondary btn-sm">').append(icon('camera'), document.createTextNode(` ${t('Snapshot now')}`));
		const $head = $('<div class="fs-be-timeline-head">').append(
			$('<div class="fs-be-timeline-titles">').append($('<h2 class="fs-be-timeline-title">').text(t(c.title)), $sub),
			c.readOnly ? null : $snap);
		const $body = $('<div class="fs-be-timeline-body">');
		$node.append($head, $body);

		let list = [];
		let focusAfter = null;

		function badges(b) {
			const out = [];
			if (b.active) out.push(badgeNode({ label: t('Active'), tone: 'ok', icon: 'circle-check' }));
			if (b.next_boot) out.push(badgeNode({ label: t('Next boot'), tone: 'info', icon: 'power-off' }));
			if (b.kind === 'snapshot') out.push(badgeNode({ label: t('Snapshot'), variant: 'outline', icon: 'camera' }));
			if (b.locked) out.push(badgeNode({ label: t('Locked'), tone: 'neutral', icon: 'lock' }));
			return out;
		}

		function shortName(b) { return b.kind === 'snapshot' ? b.name.replace(/^.*@/, '') : b.name; }

		function item(b) {
			const snap = b.kind === 'snapshot';
			const $li = $('<li class="fs-be-timeline-item">').attr({ 'data-name': b.name, 'data-kind': snap ? 'snapshot' : 'be' })
				.toggleClass('is-active', !!b.active).toggleClass('is-next', !!b.next_boot);
			const $marker = $('<span class="fs-be-timeline-marker" aria-hidden="true">').append(icon(snap ? 'camera' : b.active ? 'circle-check' : 'hard-drive'));
			const $title = $('<p class="fs-be-timeline-name">').append($('<span class="fs-mono">').text(b.name), ...badges(b));
			const facts = [];
			if (b.version) facts.push($('<span class="fs-mono">').text(b.version));
			const when = whenOf(b.created);
			if (when) facts.push($('<time>').attr({ datetime: when, title: fmt.ago(when) }).text(fmt.datetime(when)));
			if (b.size != null) facts.push($('<span class="fs-num">').text(fmt.bytes(b.size)));
			const $meta = $('<p class="fs-be-timeline-meta">').append(facts.flatMap((f, i) => (i ? [$('<span aria-hidden="true">').text(' · '), f] : [f])));
			const $main = $('<div class="fs-be-timeline-main">').append($title, $meta);
			if (b.description) $main.append($('<p class="fs-be-timeline-desc">').text(b.description));
			$li.append($marker, $main);
			if (!c.readOnly) {
				const items = [];
				/* The API boots boot environments only, and renames neither snapshots nor the running system. */
				if (!b.next_boot && !snap) items.push({ id: 'activate', label: t('Activate for next boot'), icon: 'power-off', disabled: !!b.locked });
				if (!snap) items.push({ id: 'rename', label: t('Rename'), icon: 'pen', disabled: !!b.active, title: b.active ? t('The running system cannot be renamed') : null });
				items.push({ divider: true }, { id: 'delete', label: t('Delete'), icon: 'trash-can', danger: true, disabled: !!(b.active || b.next_boot), title: b.active || b.next_boot ? t('The active or next-boot environment cannot be deleted') : null });
				$li.append(menuNode(items, { label: t('Actions for {name}', { name: b.name }), size: 'sm', onAction: (a) => act(a.id, b), className: 'fs-be-timeline-menu' }));
			}
			return $li;
		}

		function render(data, meta) {
			list = Array.isArray(data) ? data : [];
			if (!list.length) return false;
			disposeMenus(node);
			const sorted = [...list].sort((a, b) => String(whenOf(b.created) || '').localeCompare(String(whenOf(a.created) || '')));
			$body.empty().append($('<ol class="fs-be-timeline-list">').attr('aria-label', t(c.title)).append(sorted.map(item)));
			const bes = list.filter((b) => b.kind !== 'snapshot').length;
			const parts = [t('{n} boot environment', { n: bes }, '{n} boot environments'), t('{n} snapshot', { n: list.length - bes }, '{n} snapshots')];
			if (meta && meta.pool) parts.push(t('pool {pool}', { pool: meta.pool }));
			if (meta && meta.free != null) parts.push(t('{size} free', { size: fmt.bytes(meta.free) }));
			$sub.text(parts.join(' · '));
			if (focusAfter) {
				const target = focusAfter === '#snap' ? $snap : $body.find(`[data-name="${CSS.escape(focusAfter)}"] .fs-menu-toggle`);
				(target.length ? target : $snap).trigger('focus');
				focusAfter = null;
			}
			return true;
		}

		const task = states.load(ctx, $body, () => batch.get(c.source.path, c.source.query), (res) => render(res.data, res.meta), {
			every: c.every, lines: 5,
			empty: { icon: 'hard-drive', title: t('No boot environments'), text: t('This system does not use ZFS boot environments, so updates cannot be rolled back.') }
		});
		const reload = () => live.now(task.id);
		/* reload after other parts of the page changed the system (e.g. 'fs:job-done' after an update) */
		const evNs = `.fsbe${Math.random().toString(36).slice(2, 7)}`;
		if (c.reloadOn) $(document).on(String(c.reloadOn).split(/\s+/).map((ev) => `${ev}${evNs}`).join(' '), reload);

		async function act(id, b) {
			try {
				if (id === 'activate') {
					const snap = b.kind === 'snapshot';
					const ok = await confirm({
						title: snap ? t('Roll back to {name}?', { name: b.name }) : t('Boot {name} next time?', { name: b.name }),
						text: snap ? t('A new boot environment is created from this snapshot and used at the next restart. The running system is not changed until then.')
							: t('The running system is not changed. {name} is used after the next restart.', { name: b.name }),
						confirmLabel: snap ? t('Roll back') : t('Activate'),
						icon: 'power-off'
					});
					if (!ok) return;
					const res = await api.post(fill(c.paths.activate, b.name), { confirm: true });
					toast((res.meta && res.meta.message) || t('{name} will be used at the next boot', { name: b.name }), { level: 'ok' });
					focusAfter = b.name;
				} else if (id === 'rename') {
					const res = await modalForm({
						title: t('Rename {name}', { name: b.name }), method: 'PATCH', path: fill(c.paths.rename, b.name), submitLabel: t('Rename'),
						fields: [{ name: 'name', label: t('Name'), required: true, mono: true, maxlength: 64, help: b.kind === 'snapshot' ? t('Letters, digits, dots, dashes and underscores. The prefix {p} is kept.', { p: b.name.replace(/@.*$/, '@') }) : t('Letters, digits, dots, dashes and underscores.') }],
						values: { name: shortName(b) }
					});
					if (!res) return;
					focusAfter = res.data && res.data.name ? res.data.name : '#snap';
				} else if (id === 'delete') {
					const ok = await dangerConfirm({
						title: t('Delete {name}', { name: b.name }),
						text: b.kind === 'snapshot' ? t('The snapshot is removed. You can no longer roll back to it.') : t('The boot environment and its files are removed. You can no longer boot this version.'),
						name: b.name, confirmLabel: t('Delete')
					});
					if (!ok) return;
					const res = await api.del(fill(c.paths.remove, b.name));
					toast((res.meta && res.meta.message) || t('{name} deleted', { name: b.name }), { level: 'ok' });
					focusAfter = '#snap';
				}
				$node.trigger('fs:be-changed', [{ action: id, name: b.name }]);
				reload();
			} catch (e) { toast.error(e); }
		}

		$snap.on('click', async () => {
			const res = await modalForm({
				title: t('Snapshot now'), text: t('Saves the current system so you can roll back to it later. Snapshots use little space until files change.'),
				method: 'POST', path: c.paths.snapshot, submitLabel: t('Create snapshot'), icon: 'camera',
				fields: [{ name: 'name', label: t('Name'), mono: true, maxlength: 48, placeholder: t('Optional, e.g. before-vlan-change') }]
			});
			if (!res) return;
			focusAfter = res.data && res.data.name ? res.data.name : '#snap';
			$node.trigger('fs:be-changed', [{ action: 'snapshot', name: res.data && res.data.name }]);
			reload();
		});

		return {
			reload,
			/** The current list of boot environments and snapshots. */
			items: () => list.slice(),
			destroy() { disposeMenus(node); $(document).off(evNs); }
		};
	}
});
