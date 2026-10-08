#!/usr/bin/env node
/*
 * serve.mjs — local static server for the gallery (development only).
 *   npm run gallery   → http://localhost:8770/gallery/
 * Serves the repository root read-only; /ui and /themes map to dist/public.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderApp } from '../../gallery/app/render.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = Number(process.env.PORT || 8770);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };

createServer(async (req, res) => {
	let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
	if (path.startsWith('/gallery/app') && !/\.[a-z0-9]+$/.test(path)) {
		const html = await renderApp(path).catch((e) => { console.error(e); return null; });
		if (html) { res.writeHead(200, { 'Content-Type': types['.html'], 'Cache-Control': 'no-store' }).end(html); return; }
	}
	if (path.startsWith('/ui/') || path.startsWith('/themes/')) path = '/dist/public' + path;
	if (path.endsWith('/')) path += 'index.html';
	const file = normalize(join(root, path));
	if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
	try {
		if (!(await stat(file)).isFile()) throw new Error();
		res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
		res.end(await readFile(file));
	} catch {
		res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
	}
}).listen(port, () => console.log(`gallery: http://localhost:${port}/gallery/`));
