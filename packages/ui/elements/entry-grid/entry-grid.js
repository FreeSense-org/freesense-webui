/*
 * entry-grid.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * entry-grid — repeatable rows of sub-fields (alias entries, NTP servers,
 * static routes, DNS overrides). Add, remove and reorder rows with buttons
 * (keyboard friendly), within `min` / `max` rows. Every cell is a normal
 * schema field, so validation, typeahead and 422 errors work per cell.
 * Value: array of row objects keyed by the column names.
 * Registered as schema type `entry-grid`; standalone element `entry-grid`.
 */
import $ from 'jquery';
import { defineField, buildField, icon, iconButton, uid, t } from '../form/fields.js';

/* Rows are separate grids, so every column needs a deterministic width (no 'auto'). */
const WIDTH = { xs: 'minmax(4.5rem, 0.45fr)', sm: 'minmax(6rem, 0.7fr)', md: 'minmax(8rem, 1fr)', lg: 'minmax(10rem, 1.6fr)', xl: 'minmax(12rem, 2.2fr)', auto: '5.5rem' };

defineField('entry-grid', {
	group: true,
	build(f, c) {
		const cols = (f.fields || []).map((x) => ({ ...x, width: x.width || (x.type === 'switch' ? 'auto' : 'md') }));
		const min = f.min ?? 0;
		const max = f.max ?? Infinity;
		const reorder = f.reorder !== false;
		const base = uid('eg');
		const $box = $('<div class="fs-eg" role="group">').attr('aria-label', c.ariaLabel || null);
		$box[0].style.setProperty('--fs-eg-cols', `${cols.map((x) => WIDTH[x.width] || (typeof x.width === 'number' ? `minmax(6rem, ${x.width}fr)` : WIDTH.md)).join(' ')} ${reorder ? '6.5rem' : '2.25rem'}`);
		const $head = $('<div class="fs-eg-head" aria-hidden="true">').append(cols.map((x) => $('<span class="fs-eg-col">').toggleClass('is-center', x.type === 'switch').text(x.label || x.name)
			.append(x.required ? $('<span class="fs-field-req">').text('*') : null)), $('<span>'));
		const $rows = $('<ol class="fs-eg-rows">');
		const $empty = $('<div class="fs-eg-empty">').append(icon('list'), $('<span>').text(f.emptyText || t('No entries yet.')));
		const $add = $('<button type="button" class="btn btn-secondary btn-sm fs-eg-add">').append(icon('plus'), $('<span>').text(f.addLabel || t('Add entry')));
		const $count = $('<span class="fs-eg-count fs-num">');
		const $live = $('<span class="visually-hidden" role="status" aria-live="polite">');
		$box.append($head, $rows, $empty, $('<div class="fs-eg-foot">').append($add, $count, $live));

		let rows = [];
		let disabled = false;

		function rowLabel(r) { return t('row {n}', { n: rows.indexOf(r) + 1 }); }

		function buildRow(data = {}) {
			const r = { id: uid('row') };
			r.$row = $('<li class="fs-eg-row">').attr('id', r.id);
			const $cells = $('<div class="fs-eg-cells">');
			r.cells = cols.map((col) => {
				const cell = buildField(col, { compact: true, ariaLabel: col.label || col.name, value: data[col.name] !== undefined ? data[col.name] : col.default, onChange: () => c.change() });
				cell.$wrap.addClass('fs-eg-cell').prepend($('<span class="fs-eg-cell-label" aria-hidden="true">').text(col.label || col.name));
				$cells.append(cell.$wrap);
				return cell;
			});
			const $up = iconButton(t('Move up'), 'arrow-up', 'btn-ghost btn-sm').addClass('fs-eg-up');
			const $down = iconButton(t('Move down'), 'arrow-down', 'btn-ghost btn-sm').addClass('fs-eg-down');
			const $rm = iconButton(t('Remove'), 'trash-can', 'btn-ghost btn-sm').addClass('fs-eg-rm');
			const $acts = $('<div class="fs-eg-acts">').append(reorder ? [$up, $down] : null, $rm);
			r.$row.append($('<span class="fs-eg-num fs-num" aria-hidden="true">'), $cells, $acts);
			$up.on('click', () => move(r, -1, $up));
			$down.on('click', () => move(r, 1, $down));
			$rm.on('click', () => remove(r));
			r.$up = $up; r.$down = $down; r.$rm = $rm;
			return r;
		}

		function refresh() {
			rows.forEach((r, i) => {
				r.$row.find('.fs-eg-num').text(i + 1);
				r.cells.forEach((cell) => {
					const col = cell.f;
					cell.$wrap.find('[aria-label]').filter('input, select, textarea, button.form-select, [role=group], [role=radiogroup]').first()
						.attr('aria-label', `${col.label || col.name}, ${rowLabel(r)}`);
				});
				const label = rowLabel(r);
				r.$up.attr({ 'aria-label': `${t('Move up')}: ${label}`, title: t('Move up') }).prop('disabled', disabled || i === 0);
				r.$down.attr({ 'aria-label': `${t('Move down')}: ${label}`, title: t('Move down') }).prop('disabled', disabled || i === rows.length - 1);
				r.$rm.attr({ 'aria-label': `${t('Remove')}: ${label}`, title: t('Remove') }).prop('disabled', disabled || rows.length <= min);
			});
			$empty.prop('hidden', rows.length > 0);
			$head.prop('hidden', rows.length === 0);
			$add.prop('disabled', disabled || rows.length >= max);
			const n = rows.length;
			$count.text(max !== Infinity ? t('{n} of {max}', { n, max }) : t('{n} entry', { n }, '{n} entries'));
		}

		function add(focus = true) {
			if (rows.length >= max) return;
			const r = buildRow();
			rows.push(r);
			$rows.append(r.$row);
			refresh();
			$live.text(t('Row {n} added', { n: rows.length }));
			if (focus) r.cells[0] && r.cells[0].focus();
			c.change();
		}
		function remove(r) {
			if (rows.length <= min) return;
			const i = rows.indexOf(r);
			r.cells.forEach((cell) => cell.destroy());
			r.$row.remove();
			rows.splice(i, 1);
			refresh();
			$live.text(t('Row {n} removed', { n: i + 1 }));
			const next = rows[i] || rows[i - 1];
			(next ? next.$rm : $add).trigger('focus');
			c.change();
		}
		function move(r, d, $btn) {
			const i = rows.indexOf(r);
			const j = i + d;
			if (j < 0 || j >= rows.length) return;
			rows.splice(i, 1);
			rows.splice(j, 0, r);
			if (d < 0) r.$row.insertBefore(rows[j + 1].$row); else r.$row.insertAfter(rows[j - 1].$row);
			refresh();
			$live.text(t('Moved to row {n}', { n: j + 1 }));
			($btn.prop('disabled') ? (d < 0 ? r.$down : r.$up) : $btn).trigger('focus');
			c.change();
		}
		$add.on('click', () => add(true));

		function set(v) {
			rows.forEach((r) => r.cells.forEach((cell) => cell.destroy()));
			rows = (Array.isArray(v) ? v : []).map((d) => buildRow(d || {}));
			$rows.empty().append(rows.map((r) => r.$row));
			while (rows.length < min) { const r = buildRow(); rows.push(r); $rows.append(r.$row); }
			refresh();
			if (disabled) rows.forEach((r) => r.cells.forEach((cell) => cell.setDisabled(true)));
		}

		function cellEntry(r, cell, message) {
			const col = cell.f;
			return { name: `${f.name}.${rows.indexOf(r)}.${col.name}`, label: `${f.label || f.name}, ${rowLabel(r)}, ${col.label || col.name}`, message, id: cell.focusId(), focus: () => cell.focus(), section: null };
		}

		return {
			$el: $box,
			$focus: $box,
			$describe: () => $box,
			get: () => rows.map((r) => Object.fromEntries(r.cells.map((cell) => [cell.name, cell.get()]))),
			set,
			setDisabled(b) {
				disabled = b;
				$box.toggleClass('is-disabled', b);
				rows.forEach((r) => r.cells.forEach((cell) => cell.setDisabled(b)));
				refresh();
			},
			setInvalid: (b) => $box.toggleClass('is-invalid', b),
			focus() { const first = rows[0]; if (first && first.cells[0]) first.cells[0].focus(); else $add.trigger('focus'); },
			validate(v) {
				if (v.length < min) return t('Add at least {n} entry.', { n: min }, 'Add at least {n} entries.');
				if (v.length > max) return t('Use at most {n} entries.', { n: max });
				return null;
			},
			/** Validate every cell; returns error entries for the form summary. */
			validateParts() {
				const out = [];
				rows.forEach((r) => r.cells.forEach((cell) => {
					const errs = cell.validate();
					errs.forEach((e) => out.push(cellEntry(r, cell, e.message)));
				}));
				return out;
			},
			/** Server error for 'index.column' (0-based index). */
			setSubError(sub, msg) {
				const [idx, colName] = String(sub).split('.');
				const r = rows[+idx];
				const cell = r && r.cells.find((x) => x.name === colName);
				if (cell) cell.setError(msg);
				return !!cell;
			},
			clearSubErrors() { rows.forEach((r) => r.cells.forEach((cell) => cell.setError(null))); },
			subErrorEntries() {
				const out = [];
				rows.forEach((r) => r.cells.forEach((cell) => cell.errorEntries().forEach((e) => out.push(cellEntry(r, cell, e.message)))));
				return out;
			},
			display: (v) => t('{n} entry', { n: v.length }, '{n} entries'),
			destroy() { rows.forEach((r) => r.cells.forEach((cell) => cell.destroy())); }
		};
	}
}, 'entry-grid');
