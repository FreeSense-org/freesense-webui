/*
 * elements.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Element gallery: renders every fixture of every element (from
 * /gallery/fixtures.json) against the mock API, with live appearance controls.
 * ?el=<name> shows one element only.
 */
(function ($, FS) {
	'use strict';

	const WIDTH = { sm: 'g-w-sm', md: 'g-w-md', lg: 'g-w-lg', full: 'g-w-full' };
	const only = new URLSearchParams(location.search).get('el');

	function fixtureBlock(el, fx) {
		const $box = $('<figure class="g-fixture">').addClass(WIDTH[fx.width || 'md']);
		const $cap = $('<figcaption>').append($('<strong>').text(fx.name));
		if (fx.note) $cap.append($('<span class="fs-muted">').text(` · ${fx.note}`));
		const $stage = $('<div class="g-stage">');
		if (fx.surface === 'page') $stage.addClass('g-stage-page');
		const $node = $('<div>').attr({ 'data-fs-el': el.name, 'data-fs-config': JSON.stringify(fx.config || {}) });
		$stage.append($node);
		return $box.append($cap, $stage);
	}

	function render(list) {
		const $main = $('#g-main').empty();
		const $nav = $('#g-list').empty();
		for (const el of list) {
			if (only && el.name !== only) continue;
			const id = `el-${el.name}`;
			$nav.append($('<li>').append($('<a>').attr('href', `#${id}`).text(el.title || el.name)
				.append(el.status === 'draft' ? $('<span class="g-draft">').text('draft') : null)));
			const $sec = $('<section class="g-el">').attr('id', id);
			$sec.append($('<header>').append(
				$('<h2>').text(el.title || el.name),
				$('<code>').text(el.name),
				$('<a class="g-solo">').attr('href', `?el=${encodeURIComponent(el.name)}`).text('Open alone')));
			if (el.description) $sec.append($('<p class="fs-muted">').text(el.description));
			if (el.error) $sec.append($('<p class="text-danger">').text(`fixtures.json: ${el.error}`));
			const $grid = $('<div class="g-fixtures">');
			for (const fx of el.fixtures || []) $grid.append(fixtureBlock(el, fx));
			$main.append($sec.append($grid));
		}
		if (!$main.children().length) $main.append($('<p class="fs-muted">').text('No elements with fixtures yet.'));
	}

	async function accents() {
		const meta = await $.getJSON('/themes/freesense/theme.json');
		$('#g-accent').append(Object.entries(meta.accents).map(([k, a]) => $('<option>').val(k).text(a.title)));
		$('#g-accent').val(FS.theme.get().accent);
	}

	$('#g-mode, #g-accent, #g-density').on('change', () => FS.theme.set({ mode: $('#g-mode').val(), accent: $('#g-accent').val(), density: $('#g-density').val() }));
	$('#g-filter').on('input', function () {
		const q = this.value.toLowerCase();
		$('#g-list li').each(function () { $(this).toggle($(this).text().toLowerCase().includes(q)); });
	});

	$(async () => {
		$('#g-version').text(`v${FS.version}`);
		await accents();
		render(await $.getJSON('/gallery/fixtures.json'));
	});
})(jQuery, window.FS);
