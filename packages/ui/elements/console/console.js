/*
 * console.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * console — monospace output panel for tool results (ping, traceroute, a
 * command, a job log). Static lines, or a live source read with a line
 * cursor (?after=<n>) until the source reports it is done. Plain text only:
 * ANSI escapes are stripped and every line is set with .text().
 * Auto-scroll follows the end until the user scrolls up. See spec.md.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { batch } from '../../js/batch.js';
import { states } from '../../js/states.js';
import { t } from '../../js/i18n.js';
import { toast } from '../toast/toast.js';

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b[@-Z\\-_]|\r/g; // eslint-disable-line no-control-regex
const DONE_STATES = ['succeeded', 'failed', 'done', 'finished', 'cancelled'];

export function icon(name) { return $('<i aria-hidden="true">').addClass(`fa-solid fa-${name}`); }

/** Normalise one line: a string or {n, text, level, t}. */
function lineOf(l) {
	if (l == null) return null;
	if (typeof l === 'string' || typeof l === 'number') return { text: String(l) };
	return { n: l.n, text: String(l.text ?? l.line ?? ''), level: l.level || null, t: l.t || null };
}

/** Lines and "done" from a response body ({data, meta}). */
export function parseOutput(res) {
	const d = res && res.data;
	let lines = [];
	let done = false;
	if (Array.isArray(d)) lines = d;
	else if (typeof d === 'string') lines = d.split('\n');
	else if (d && typeof d === 'object') {
		lines = d.lines || d.log || (typeof d.output === 'string' ? d.output.split('\n') : []) || [];
		done = !!d.done || DONE_STATES.includes(d.state);
	}
	const cursor = res && res.meta && res.meta.cursor != null ? res.meta.cursor : null;
	return { lines: lines.map(lineOf).filter(Boolean), done, cursor };
}

el.define('console', {
	init(node, config, ctx) {
		const c = { maxLines: 2000, wrap: false, copy: true, every: 1, height: '20rem', timestamps: false, ...config };
		const $node = $(node).addClass('fs-console').empty().attr('data-wrap', c.wrap ? 'true' : 'false');
		const $bar = $('<div class="fs-console-bar">');
		const $title = $('<span class="fs-console-title">').text(c.title ? t(c.title) : '');
		const $state = $('<span class="fs-console-state" role="status">');
		const $tools = $('<div class="fs-console-tools">');
		const $wrap = $('<button type="button" class="btn btn-ghost btn-sm fs-console-btn">').attr('aria-pressed', String(!!c.wrap))
			.append(icon('arrow-turn-down'), $('<span>').text(t('Wrap')));
		const $copy = $('<button type="button" class="btn btn-ghost btn-sm fs-console-btn">').append(icon('copy'), $('<span>').text(t('Copy')));
		$tools.append($wrap, c.copy ? $copy : null);
		$bar.append($title, $state, $tools);
		const $out = $('<div class="fs-console-out" role="log" aria-live="off" tabindex="0">').attr('aria-label', c.title ? t(c.title) : t('Output'));
		if (c.height !== 'auto') $out.css('max-height', c.height);
		const $lines = $('<div class="fs-console-lines">');
		const $jump = $('<button type="button" class="btn btn-secondary btn-sm fs-console-jump" hidden>').append(icon('arrow-down'), $('<span>').text(t('Jump to end')));
		$out.append($lines);
		$node.append(c.bare ? null : $bar, $('<div class="fs-console-frame">').append($out, $jump));

		let count = 0;
		let follow = true;
		let cursor = 0;
		let task = null;
		let done = false;
		let dropped = 0;

		const atEnd = () => $out[0].scrollHeight - $out[0].scrollTop - $out[0].clientHeight < 24;
		function scrollEnd() { $out[0].scrollTop = $out[0].scrollHeight; }

		function lineNode(l) {
			const $l = $('<div class="fs-console-line">');
			if (l.level) $l.attr('data-level', l.level);
			if (c.timestamps && l.t) $l.append($('<span class="fs-console-time">').text(new Date(l.t).toLocaleTimeString([], { hour12: false })));
			$l.append(document.createTextNode(l.text.replace(ANSI, '') || ' '));
			if (l.level === 'error') $l.prepend($('<span class="visually-hidden">').text(`${t('Error')}: `));
			return $l;
		}

		function append(input) {
			const list = (Array.isArray(input) ? input : String(input ?? '').split('\n')).map(lineOf).filter(Boolean);
			if (!list.length) return;
			const stick = follow;
			const frag = document.createDocumentFragment();
			for (const l of list) {
				frag.appendChild(lineNode(l)[0]);
				if (l.n != null) cursor = Math.max(cursor, l.n);
			}
			$lines.find('.fs-console-empty').remove();
			$lines[0].appendChild(frag);
			count += list.length;
			if (count > c.maxLines) {
				const extra = count - c.maxLines;
				$lines.children('.fs-console-line').slice(0, extra).remove();
				dropped += extra;
				count = c.maxLines;
				$node.attr('data-trimmed', '');
			}
			if (stick) scrollEnd();
		}

		function clear() {
			$lines.empty();
			count = 0;
			cursor = 0;
			dropped = 0;
			follow = true;
			$jump.prop('hidden', true);
		}

		function setState(text, kind) {
			$state.text(text || '').attr('data-kind', kind || null);
		}

		function text() {
			return $lines.children('.fs-console-line').map((_, n) => n.textContent.replace(/^ $/, '')).get().join('\n');
		}

		/* auto-scroll: stops when the user scrolls up, resumes at the end */
		$out.on('scroll', () => {
			follow = atEnd();
			$jump.prop('hidden', follow);
		});
		$jump.on('click', () => { follow = true; scrollEnd(); $jump.prop('hidden', true); $out.trigger('focus'); });

		$wrap.on('click', () => {
			const on = $node.attr('data-wrap') !== 'true';
			$node.attr('data-wrap', String(on));
			$wrap.attr('aria-pressed', String(on));
		});
		$copy.on('click', () => {
			const value = text();
			const okMsg = t('Output copied');
			if (navigator.clipboard && window.isSecureContext !== false) {
				navigator.clipboard.writeText(value).then(() => toast(okMsg, { level: 'ok' }), () => toast(t('Could not copy the output'), { level: 'warn' }));
			} else {
				const ta = $('<textarea class="visually-hidden">').val(value).appendTo(document.body);
				ta[0].select();
				try { document.execCommand('copy'); toast(okMsg, { level: 'ok' }); } catch { toast(t('Could not copy the output'), { level: 'warn' }); }
				ta.remove();
			}
		});

		function startSource(source) {
			if (task) { task.every = 0; task = null; }
			done = false;
			if (!source || !source.path) return;
			setState(t('Running…'), 'running');
			let first = true;
			states.loading($lines, { lines: 3 });
			task = ctx.live({
				every: c.every,
				run: () => batch.get(source.path, cursor ? { ...(source.query || {}), after: cursor } : source.query).then((res) => {
					const out = parseOutput(res);
					if (first) { $lines.empty(); first = false; }
					append(out.lines);
					if (out.cursor != null) cursor = Math.max(cursor, out.cursor);
					if (!count && out.done) $lines.append($('<div class="fs-console-empty">').text(t('No output')));
					if (out.done && !done) {
						done = true;
						if (task) task.every = 0;
						setState(t('Finished'), 'done');
						$node.trigger('fs:console-done', [{ lines: count }]);
					}
				}),
				onState(s, info) {
					ctx.state(s);
					if (s === 'error') {
						if (first) { setState(t('Could not load the output'), 'error'); states.error($lines, { message: info.error, compact: true, retry: () => { states.loading($lines, { lines: 3 }); startSource(source); } }); }
						else setState(t('Connection lost, retrying…'), 'error');
					}
					if (s === 'ok' && !done) setState(t('Running…'), 'running');
				}
			});
		}

		if (c.lines && c.lines.length) append(c.lines);
		else if (!c.source) $lines.append($('<div class="fs-console-empty">').text(t(c.placeholder || 'No output yet')));
		if (c.source) startSource(c.source);
		if (c.status) setState(t(c.status), c.statusKind || null);

		return {
			/** Append text (split on newlines) or lines [{text, level, n}]. */
			append,
			clear,
			/** All visible output as plain text. */
			text,
			/** Lines received so far and how many were dropped by maxLines. */
			count: () => ({ lines: count, dropped }),
			/** Follow another live source (resets the output). */
			setSource(source) { clear(); c.source = source; startSource(source); },
			/** Stop polling the live source. */
			stop() { if (task) task.every = 0; },
			/** Status text in the bar ('running' | 'done' | 'error' kind). */
			setStatus: setState,
			/** Reset the placeholder after clear(). */
			placeholder(msg) { $lines.empty().append($('<div class="fs-console-empty">').text(msg || t('No output yet'))); },
			destroy() { $out.off(); }
		};
	}
});
