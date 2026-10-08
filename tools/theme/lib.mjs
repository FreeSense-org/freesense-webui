/*
 * Theme library: scheme compatibility, schema validation, contrast checks and
 * compilation of a <name>.theme.json into CSS custom properties.
 *
 * The same rules are implemented in PHP on the firewall for imported themes
 * (app/Theme); tests keep both implementations in step.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const engine = JSON.parse(readFileSync(join(root, 'packages', 'ui', 'package.json'), 'utf8'));

/** The theme scheme this engine supports, e.g. "2.0". */
export const SUPPORTED_SCHEME = engine.freesense.themeScheme;

/**
 * Can a theme written for `scheme` be installed on a system that supports `supported`?
 * Same major and theme minor <= system minor. Returns {ok, reason}.
 */
export function schemeCompatible(scheme, supported = SUPPORTED_SCHEME) {
	const m = /^(\d+)\.(\d+)$/.exec(String(scheme || ''));
	const s = /^(\d+)\.(\d+)$/.exec(supported);
	if (!m) return { ok: false, reason: 'The theme does not declare a valid "scheme" (for example "2.0").' };
	if (+m[1] !== +s[1]) return { ok: false, reason: `This theme is written for theme scheme ${scheme}; this system supports ${supported}. Themes from another major version cannot be installed.` };
	if (+m[2] > +s[2]) return { ok: false, reason: `This theme needs theme scheme ${scheme}; this system supports ${supported}. Update FreeSense first.` };
	return { ok: true, reason: null };
}

const validators = {};
function validator(scheme) {
	if (!validators[scheme]) {
		const file = join(root, 'schema', `theme-${scheme}.schema.json`);
		if (!existsSync(file)) throw new Error(`No schema file for theme scheme ${scheme}`);
		const ajv = new Ajv2020({ allErrors: true, strict: true });
		addFormats(ajv);
		validators[scheme] = ajv.compile(JSON.parse(readFileSync(file, 'utf8')));
	}
	return validators[scheme];
}

/* ------------------------------------------------------------ contrast */

function rgb(hex) {
	const h = hex.replace('#', '');
	return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}
function alpha(hex) { return hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1; }
function blend(fg, bg) {
	const a = alpha(fg), f = rgb(fg), b = rgb(bg);
	return '#' + f.map((c, i) => Math.round((c * a + b[i] * (1 - a)) * 255).toString(16).padStart(2, '0')).join('');
}
function luminance(hex) {
	return rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
		.reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
}
export function contrast(fg, bg) {
	const solidBg = bg.slice(0, 7);
	const a = luminance(blend(fg, solidBg)), b = luminance(solidBg);
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** All contrast pairs a theme must satisfy, per mode and accent. */
export function contrastIssues(theme) {
	const issues = [];
	for (const mode of ['light', 'dark']) {
		const m = theme.modes[mode];
		const surfaces = { 'surface.page': m.surface.page, 'surface.raised': m.surface.raised };
		const need = (name, fg, bgName, bg, min) => {
			const r = contrast(fg, bg);
			if (r < min) issues.push(`${mode}: ${name} ${fg} on ${bgName} ${bg} is ${r.toFixed(2)}:1, needs ${min}:1`);
		};
		for (const [bn, bg] of Object.entries(surfaces)) {
			for (const t of ['strong', 'default', 'muted']) need(`text.${t}`, m.text[t], bn, bg, 4.5);
			need('border.strong', m.border.strong, bn, bg, 3);
			need('border.focus', m.border.focus, bn, bg, 3);
			for (const [k, v] of Object.entries(m.status)) need(`status.${k}`, v, bn, bg, 4.5);
			for (const [k, v] of Object.entries(m.action)) need(`action.${k}`, v, bn, bg, 4.5);
			need('chart.text', m.chart.text, bn, bg, 4.5);
		}
		need('text.default', m.text.default, 'surface.sunken', m.surface.sunken, 4.5);
		need('text.topbar', m.text.topbar, 'surface.topbar', m.surface.topbar, 4.5);
		need('text.default', m.text.default, 'surface.section', m.surface.section, 4.5);
		need('text.muted', m.text.muted, 'surface.section', m.surface.section, 4.5);
		for (const [id, acc] of Object.entries(theme.accents)) {
			const a = acc[mode];
			need(`accent.${id}.on`, a.on, `accent.${id}.fill`, a.fill, 4.5);
			for (const [bn, bg] of Object.entries(surfaces)) {
				need(`accent.${id}.text`, a.text, bn, bg, 4.5);
				need(`accent.${id}.fill`, a.fill, bn, bg, 3);
			}
			if (theme.skin?.topbar === 'accent') need(`text.topbar`, m.text.topbar, `accent.${id}.fill`, a.fill, 4.5);
		}
	}
	return issues;
}

/* ---------------------------------------------------------------- check */

/** Full check: scheme compatibility, schema validation, references, contrast. */
export function checkTheme(theme, supported = SUPPORTED_SCHEME) {
	const errors = [];
	const compat = schemeCompatible(theme && theme.scheme, supported);
	if (!compat.ok) return { ok: false, errors: [compat.reason] };
	const validate = validator(theme.scheme);
	if (!validate(theme)) {
		for (const e of validate.errors) errors.push(`schema: ${e.instancePath || '/'} ${e.message}${e.params && e.params.additionalProperty ? ` (${e.params.additionalProperty})` : ''}`);
		return { ok: false, errors };
	}
	if (!theme.accents[theme.defaultAccent]) errors.push(`defaultAccent "${theme.defaultAccent}" is not one of the accents`);
	errors.push(...contrastIssues(theme));
	return { ok: errors.length === 0, errors };
}

/* -------------------------------------------------------------- compile */

const DEFAULTS = {
	shape: { radiusSm: '6px', radiusMd: '10px', radiusLg: '16px', borderWidth: '1px', focusWidth: '2px' },
	densities: {
		comfortable: { base: '0.875rem', control: '2.375rem', row: '2.5rem', gap: '1rem', pad: '1.25rem' },
		compact: { base: '0.8125rem', control: '2rem', row: '2rem', gap: '0.75rem', pad: '0.875rem' }
	},
	fonts: { ui: { family: 'Inter' }, mono: { family: 'JetBrains Mono' } },
	motion: { fast: '120ms', base: '200ms', slow: '320ms' },
	skin: { topbar: 'surface', sectionMenu: 'surface', cards: 'outlined', tables: 'lines', buttons: 'rounded' }
};
const FALLBACK = { ui: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" };

const decl = (vars) => Object.entries(vars).map(([k, v]) => `\t--fs-${k}: ${v};`).join('\n');

function modeVars(m) {
	const v = {};
	for (const [k, c] of Object.entries(m.surface)) v[`surface-${k}`] = c;
	for (const [k, c] of Object.entries(m.text)) v[`text-${k}`] = c;
	for (const [k, c] of Object.entries(m.border)) v[`border-${k}`] = c;
	for (const [k, c] of Object.entries(m.status)) v[`status-${k}`] = c;
	for (const [k, c] of Object.entries(m.action)) v[`action-${k}`] = c;
	m.series.colors.forEach((c, i) => { v[`series-${i + 1}`] = c; });
	v['series-other'] = m.series.other;
	v['chart-grid'] = m.chart.grid;
	v['chart-text'] = m.chart.text;
	for (const [k, c] of Object.entries(m.shadow)) v[`shadow-${k}`] = c;
	return v;
}

/**
 * Compile a checked theme to CSS. Selectors are scoped by data-fs-theme, so
 * several themes can be loaded side by side (the theme picker preview).
 */
export function compileTheme(theme) {
	const t = theme.name;
	const shape = { ...DEFAULTS.shape, ...theme.shape };
	const fonts = { ...DEFAULTS.fonts, ...theme.fonts };
	const motion = { ...DEFAULTS.motion, ...theme.motion };
	const dens = {
		comfortable: { ...DEFAULTS.densities.comfortable, ...(theme.densities || {}).comfortable },
		compact: { ...DEFAULTS.densities.compact, ...(theme.densities || {}).compact }
	};
	const sel = (extra = '') => `:root[data-fs-theme="${t}"]${extra}`;
	const out = [`/* ${theme.title} ${theme.version} (theme scheme ${theme.scheme}). Generated from ${t}.theme.json; do not edit. */`];
	out.push(`@layer theme {`);
	out.push(`${sel()} {\n${decl({
		'radius-sm': shape.radiusSm, 'radius-md': shape.radiusMd, 'radius-lg': shape.radiusLg,
		'border-width': shape.borderWidth, 'focus-width': shape.focusWidth,
		'font-ui': `'${fonts.ui.family}', ${FALLBACK.ui}`, 'font-mono': `'${fonts.mono.family}', ${FALLBACK.mono}`,
		'dur-fast': motion.fast, 'dur-base': motion.base, 'dur-slow': motion.slow
	})}\n}`);
	for (const [d, vals] of Object.entries(dens)) {
		out.push(`${sel(`[data-fs-density="${d}"]`)} {\n${decl({ 'size-base': vals.base, 'control-h': vals.control, 'row-h': vals.row, gap: vals.gap, pad: vals.pad })}\n}`);
	}
	for (const mode of ['light', 'dark']) {
		out.push(`${sel(`[data-bs-theme="${mode}"]`)} {\n\tcolor-scheme: ${mode};\n${decl(modeVars(theme.modes[mode]))}\n}`);
		for (const [id, acc] of Object.entries(theme.accents)) {
			const a = acc[mode];
			out.push(`${sel(`[data-bs-theme="${mode}"][data-fs-accent="${id}"]`)} {\n${decl({ 'accent-fill': a.fill, 'accent-text': a.text, 'accent-on': a.on })}\n}`);
		}
	}
	out.push('}');
	return out.join('\n') + '\n';
}

/** Public metadata for the theme picker (no colours beyond the preview swatches). */
export function themeMeta(theme) {
	return {
		scheme: theme.scheme, name: theme.name, title: theme.title, version: theme.version,
		description: theme.description || '', author: theme.author || '', license: theme.license || '',
		defaultMode: theme.defaultMode || 'auto', defaultAccent: theme.defaultAccent,
		accents: Object.fromEntries(Object.entries(theme.accents).map(([k, a]) => [k, { title: a.title, light: a.light.fill, dark: a.dark.fill }])),
		skin: { ...DEFAULTS.skin, ...theme.skin },
		preview: { light: theme.modes.light.surface.page, dark: theme.modes.dark.surface.page }
	};
}
