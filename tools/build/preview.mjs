#!/usr/bin/env node
/*
 * preview.mjs
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * npm run preview: the PHP app with demo data at http://localhost:8770/next/
 * (and the gallery at /gallery/ as usual). Starts PHP's built-in server on
 * app/dev/router.php (local php, or the php:8.5-cli container) and the
 * gallery server, which proxies /next/ to it and injects the mock API.
 */
import { spawn, spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const phpPort = Number(process.env.PHP_PORT || 8771);
const children = [];

const hasPhp = spawnSync('php', ['-v'], { stdio: 'ignore' }).status === 0;
const php = hasPhp
	? spawn('php', ['-S', `127.0.0.1:${phpPort}`, '-t', root, join(root, 'app', 'dev', 'router.php')], { stdio: 'inherit', cwd: root })
	: spawn('docker', ['run', '--rm', '--name', 'fs-webui-preview', '-p', `127.0.0.1:${phpPort}:${phpPort}`, '-v', `${root}:/w`, '-w', '/w',
		'php:8.5-cli', 'php', '-S', `0.0.0.0:${phpPort}`, '-t', '/w', 'app/dev/router.php'], { stdio: 'inherit' });
children.push(php);

const gallery = spawn(process.execPath, [join(root, 'tools', 'build', 'serve.mjs')], {
	stdio: 'inherit', env: { ...process.env, FS_PREVIEW_PHP: `http://127.0.0.1:${phpPort}` }
});
children.push(gallery);
console.log(`preview: http://localhost:${process.env.PORT || 8770}/next/ (PHP ${hasPhp ? 'local' : 'in docker'} on ${phpPort})`);

const stop = () => {
	for (const c of children) c.kill();
	if (!hasPhp) spawnSync('docker', ['stop', 'fs-webui-preview'], { stdio: 'ignore' });
	process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const c of children) c.on('exit', stop);
