#!/usr/bin/env node
/*
 * serve.mjs
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * serve.mjs — local server for the gallery (development only).
 *   npm run gallery   → http://localhost:8770/gallery/
 *
 *   /ui/*, /themes/*        dist/public (the built engine and themes)
 *   /gallery/app/*          the shell, rendered from gallery/app (like the PHP Shell)
 *   /gallery/fixtures.json  every packages/ui/elements/<name>/fixtures.json
 *   <!--fs-mock-->          in any gallery HTML: replaced by the mock API scripts
 * The page modules are re-imported on each request, so edits show up on reload.
 */
import { createServer } from 'node:http';
import { readFile, stat, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = Number(process.env.PORT || 8770);
/* PHP preview of the app (tools/build/preview.mjs sets it). */
const preview = process.env.FS_PREVIEW_PHP || '';
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8' };

async function mockScripts() {
	const files = (await readdir(join(root, 'gallery', 'mock'))).filter((f) => /^routes-.*\.js$/.test(f)).sort();
	return ['core.js', ...files].map((f) => `<script src="/gallery/mock/${f}"></script>`).join('\n');
}

async function fixtures() {
	const dir = join(root, 'packages', 'ui', 'elements');
	const out = [];
	for (const name of (await readdir(dir)).sort()) {
		const f = join(dir, name, 'fixtures.json');
		if (!existsSync(f)) continue;
		try { out.push({ name, ...JSON.parse(await readFile(f, 'utf8')) }); } catch (e) { out.push({ name, error: String(e) }); }
	}
	return out;
}

function send(res, status, type, body) {
	res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(body);
}

createServer(async (req, res) => {
	let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
	try {
		if (path === '/gallery/fixtures.json') return send(res, 200, types['.json'], JSON.stringify(await fixtures()));
		/* The PHP app preview (npm run preview): /next/* from PHP's built-in server, with the mock API injected. */
		if (preview && (path === '/next' || path.startsWith('/next/'))) {
			const r = await fetch(preview + req.url, { headers: { cookie: req.headers.cookie || '' }, redirect: 'manual' });
			const type = r.headers.get('content-type') || 'text/plain';
			let body = await r.text();
			if (type.startsWith('text/html')) {
				const mock = await mockScripts();
				/* After fs-ui.js (the mock hooks into its jQuery), like <!--fs-mock--> in the gallery shell. */
				body = body.replace(/<script src="\/ui\/fs-ui\.js[^"]*"><\/script>/, (m) => `${m}\n${mock}`);
			}
			const headers = { 'Content-Type': type, 'Cache-Control': 'no-store' };
			if (r.headers.get('location')) headers.Location = r.headers.get('location');
			return res.writeHead(r.status, headers).end(body);
		}
		if (path.startsWith('/gallery/app') && !/\.[a-z0-9]+$/.test(path)) {
			const mod = await import(`${pathToFileURL(join(root, 'gallery', 'app', 'render.mjs')).href}?t=${Date.now()}`);
			const html = await mod.renderApp(path);
			if (html) return send(res, 200, types['.html'], html.replace('<!--fs-mock-->', await mockScripts()));
		}
		if (path.startsWith('/ui/') || path.startsWith('/themes/')) path = '/dist/public' + path;
		if (path.endsWith('/')) path += 'index.html';
		const file = normalize(join(root, path));
		if (!file.startsWith(root)) return send(res, 403, 'text/plain', 'Forbidden');
		if (!(await stat(file)).isFile()) throw new Error('not a file');
		let body = await readFile(file);
		if (extname(file) === '.html') body = body.toString('utf8').replace('<!--fs-mock-->', await mockScripts());
		return send(res, 200, types[extname(file)] || 'application/octet-stream', body);
	} catch (e) {
		if (e && e.code !== 'ENOENT' && e.message !== 'not a file') console.error(e);
		return send(res, 404, 'text/plain', 'Not found');
	}
}).listen(port, () => console.log(`gallery: http://localhost:${port}/gallery/`));
