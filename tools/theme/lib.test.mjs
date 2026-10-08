/*
 * lib.test.mjs
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { schemeCompatible, checkTheme, contrast, compileTheme } from './lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const base = () => JSON.parse(readFileSync(join(root, 'packages', 'theme-freesense', 'freesense.theme.json'), 'utf8'));

test('scheme: same version installs', () => {
	assert.equal(schemeCompatible('2.0', '2.0').ok, true);
});

test('scheme: older minor installs on a newer system', () => {
	assert.equal(schemeCompatible('2.0', '2.1').ok, true);
});

test('scheme: a 2.1 theme is refused on a 2.0 system', () => {
	const r = schemeCompatible('2.1', '2.0');
	assert.equal(r.ok, false);
	assert.match(r.reason, /needs theme scheme 2\.1; this system supports 2\.0/);
});

test('scheme: another major is refused both ways', () => {
	assert.equal(schemeCompatible('3.0', '2.4').ok, false);
	assert.equal(schemeCompatible('1.9', '2.0').ok, false);
});

test('scheme: missing or malformed scheme is refused', () => {
	assert.equal(schemeCompatible(undefined, '2.0').ok, false);
	assert.equal(schemeCompatible('2', '2.0').ok, false);
	assert.equal(schemeCompatible('2.0.1', '2.0').ok, false);
});

test('contrast: known pairs', () => {
	assert.equal(contrast('#000000', '#ffffff').toFixed(2), '21.00');
	assert.equal(contrast('#777777', '#ffffff').toFixed(2), '4.48');
});

test('check: the core theme passes', () => {
	const r = checkTheme(base());
	assert.deepEqual(r.errors, []);
	assert.equal(r.ok, true);
});

test('check: a missing mode fails schema validation', () => {
	const t = base();
	delete t.modes.dark;
	assert.equal(checkTheme(t).ok, false);
});

test('check: free CSS is rejected (values must be hex)', () => {
	const t = base();
	t.modes.light.surface.page = 'url(https://evil.example/x.png)';
	assert.equal(checkTheme(t).ok, false);
});

test('check: unknown properties are rejected', () => {
	const t = base();
	t.css = 'body { display: none }';
	assert.equal(checkTheme(t).ok, false);
});

test('check: low contrast fails with the failing pair named', () => {
	const t = base();
	t.modes.light.text.muted = '#c0c4ca';
	const r = checkTheme(t);
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.startsWith('light: text.muted')));
});

test('check: a 2.1 theme is refused before schema validation', () => {
	const t = base();
	t.scheme = '2.1';
	const r = checkTheme(t, '2.0');
	assert.equal(r.ok, false);
	assert.match(r.errors[0], /Update FreeSense first/);
});

test('compile: both modes and every accent are emitted, scoped to the theme', () => {
	const css = compileTheme(base());
	assert.match(css, /:root\[data-fs-theme="freesense"\]\[data-bs-theme="light"\]/);
	assert.match(css, /:root\[data-fs-theme="freesense"\]\[data-bs-theme="dark"\]/);
	for (const a of Object.keys(base().accents)) assert.match(css, new RegExp(`data-fs-accent="${a}"`));
	assert.doesNotMatch(css, /url\(/);
});
