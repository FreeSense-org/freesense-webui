/* Gallery controls: switch theme/mode/accent/density live and show token values. */
(function ($, FS) {
	'use strict';

	const TOKENS = [
		['surface-page', 'bg'], ['surface-raised', 'bg'], ['surface-sunken', 'bg'], ['surface-topbar', 'bg'], ['surface-section', 'bg'],
		['text-strong', 'fg'], ['text-default', 'fg'], ['text-muted', 'fg'],
		['border-default', 'bg'], ['border-strong', 'mark'], ['border-focus', 'mark'],
		['accent-fill', 'mark'], ['accent-text', 'fg'],
		['status-ok', 'fg'], ['status-warn', 'fg'], ['status-crit', 'fg'], ['status-info', 'fg'],
		['action-pass', 'fg'], ['action-block', 'fg'], ['action-reject', 'fg'], ['action-match', 'fg'],
		['series-1', 'mark'], ['series-2', 'mark'], ['series-3', 'mark'], ['series-4', 'mark']
	];

	const hex = (v) => {
		v = v.trim().toLowerCase();
		return /^#[0-9a-f]{3}$/.test(v) ? '#' + [...v.slice(1)].map((c) => c + c).join('') : v;
	};
	function lum(h) {
		const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
		return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
	}
	const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

	function swatches() {
		const cs = getComputedStyle(document.documentElement);
		const raised = hex(cs.getPropertyValue('--fs-surface-raised'));
		$('#g-swatches').empty().append(TOKENS.map(([name, kind]) => {
			const v = hex(cs.getPropertyValue(`--fs-${name}`));
			const $s = $('<div class="g-sw"><span></span><div><code></code><b></b></div></div>');
			$s.find('span').css('background', v);
			$s.find('code').text(name);
			if (kind !== 'bg' && /^#[0-9a-f]{6}$/.test(v) && /^#[0-9a-f]{6}$/.test(raised)) {
				const r = ratio(v, raised), need = kind === 'fg' ? 4.5 : 3;
				$s.find('b').text(r.toFixed(1)).toggleClass('g-fail', r < need).attr('title', `${r.toFixed(2)}:1 on surface.raised (needs ${need}:1)`);
			} else $s.find('b').text(v);
			return $s;
		}));
	}

	async function loadThemes() {
		const manifest = await $.getJSON('/ui/manifest.json');
		$('#g-version').text(`v${manifest.version} · scheme ${manifest.themeScheme}`);
		$('#g-theme').empty().append(manifest.themes.map((t) => $('<option>').val(t).text(t)));
		return manifest;
	}

	async function loadAccents(name) {
		const meta = await $.getJSON(`/themes/${encodeURIComponent(name)}/theme.json`);
		const current = FS.theme.get().accent;
		$('#g-accent').empty().append(Object.entries(meta.accents).map(([k, a]) => $('<option>').val(k).text(a.title)));
		$('#g-accent').val(meta.accents[current] ? current : meta.defaultAccent);
		return meta;
	}

	async function apply() {
		await FS.theme.set({ theme: $('#g-theme').val(), mode: $('#g-mode').val(), accent: $('#g-accent').val(), density: $('#g-density').val() });
	}

	$(document).on('fs:theme', () => requestAnimationFrame(swatches));
	$('#g-theme').on('change', async function () { await loadAccents(this.value); await apply(); });
	$('#g-mode, #g-accent, #g-density').on('change', apply);

	$(async () => {
		await loadThemes();
		await loadAccents(FS.theme.get().theme);
		$('#g-mode').val(FS.theme.get().mode);
		await apply();
		const names = FS.el.names();
		$('#g-elements').text(names.length ? names.join(', ') : 'No elements in the catalogue yet (P3). The runtime is loaded: FS ' + FS.version + '.');
	});
})(jQuery, window.FS);
