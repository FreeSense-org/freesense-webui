/*
 * FS.el — element registry.
 *
 *   FS.el.define('stat-tile', { init(node, config, ctx) { … return { update, destroy } } })
 *
 * Every node with data-fs-el="<name>" is initialised once, with its JSON
 * config from data-fs-config. Nodes added later (partial navigation, AJAX,
 * other elements) are picked up by a MutationObserver, and removed nodes are
 * destroyed, so their live tasks stop. Unknown element names are reported once
 * in the console and rendered as an error state; they never break the page.
 */
import { live } from './live.js';

const defs = new Map();
const instances = new WeakMap();
const warned = new Set();
let observer = null;

function parse(node) {
	const raw = node.getAttribute('data-fs-config');
	if (!raw) return {};
	try { return JSON.parse(raw); } catch {
		console.error('fs-el: invalid data-fs-config', node);
		return {};
	}
}

function initNode(node) {
	if (instances.has(node)) return;
	const name = node.getAttribute('data-fs-el');
	const def = defs.get(name);
	if (!def) {
		if (!warned.has(name)) { warned.add(name); console.error(`fs-el: unknown element "${name}"`); }
		node.setAttribute('data-fs-state', 'error');
		return;
	}
	const taskIds = [];
	const ctx = {
		/** Register a live task owned by this element instance. */
		live(o) {
			const id = `${name}:${Math.random().toString(36).slice(2, 9)}:${o.id || ''}`;
			taskIds.push(id);
			return live.add({ ...o, id, scope: node.closest('[data-fs-main]') ? 'page' : 'shell' });
		},
		state(s) { node.setAttribute('data-fs-state', s); }
	};
	const inst = def.init(node, parse(node), ctx) || {};
	instances.set(node, { inst, taskIds });
	node.setAttribute('data-fs-ready', '');
}

function destroyNode(node) {
	const rec = instances.get(node);
	if (!rec) return;
	rec.taskIds.forEach((id) => live.remove(id));
	if (rec.inst.destroy) rec.inst.destroy();
	instances.delete(node);
}

function scan(root, fn) {
	if (root.nodeType !== 1) return;
	if (root.hasAttribute('data-fs-el')) fn(root);
	root.querySelectorAll('[data-fs-el]').forEach(fn);
}

export const el = {
	define(name, def) {
		if (defs.has(name)) throw new Error(`fs-el: element "${name}" is already defined`);
		defs.set(name, def);
		if (document.readyState !== 'loading') document.querySelectorAll(`[data-fs-el="${name}"]`).forEach(initNode);
	},
	has: (name) => defs.has(name),
	names: () => [...defs.keys()].sort(),
	/** Instance API of an initialised node (e.g. a data-table's reload()). */
	get: (node) => instances.get(node)?.inst || null,
	start(root = document.body) {
		scan(root, initNode);
		if (observer) return;
		observer = new MutationObserver((records) => {
			for (const r of records) {
				r.removedNodes.forEach((n) => scan(n, destroyNode));
				r.addedNodes.forEach((n) => scan(n, initNode));
			}
		});
		observer.observe(document.body, { childList: true, subtree: true });
	}
};
