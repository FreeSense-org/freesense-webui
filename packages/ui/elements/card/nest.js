/*
 * nest.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Nested content for container elements (card, section, grid, split-view,
 * tabs, and any later element that holds other elements).
 *
 * Elements render from config, so a container cannot take server-rendered
 * children. It takes a `content` value instead and renders child element
 * nodes (<div data-fs-el data-fs-config>) that FS.el initialises like any
 * other element. The PHP builder serialises nested builder calls to the same
 * shape: $ui->card(...)->content($ui->kvList(...)).
 *
 *   content (one of):
 *     "Plain text"                         one paragraph
 *     ["Para 1", "Para 2"]                 paragraphs
 *     { type: 'text', text, muted }        text, string or array
 *     { type: 'kv', ...kv-list config }    a nested kv-list
 *     { type: 'elements', items: [Item] }  stacked child elements
 *     [Item, Item]                         shorthand for type 'elements'
 *     Item                                 one child element
 *
 *   Item: { el: '<element name>', config: {…}, id? }
 *
 * Children are initialised immediately (startChildren), so their instance
 * API (FS.el.get) is available as soon as the parent's init returns, also
 * during the first page scan, before FS.el's MutationObserver runs.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';

const isItem = (c) => c && typeof c === 'object' && !Array.isArray(c) && typeof c.el === 'string';

/** One child element node. */
export function childNode(item) {
	const $n = $('<div>').attr({ 'data-fs-el': item.el, 'data-fs-config': JSON.stringify(item.config || {}) });
	if (item.id) $n.attr('id', item.id);
	return $n;
}

/** Initialise child element nodes now; FS.el skips nodes already initialised. */
export function startChildren($scope) {
	$scope.each((_, n) => { if (n.isConnected) el.start(n); });
}

function paragraphs(text, muted) {
	const list = Array.isArray(text) ? text : [text];
	return list.filter((p) => p != null && p !== '').map((p) => $('<p class="fs-nest-text">').toggleClass('fs-muted', !!muted).text(String(p)));
}

/**
 * Build the nodes for a content value (not yet attached).
 * Returns a jQuery set; attach it, then call startChildren on the container.
 */
export function contentNodes(content) {
	if (content == null || content === '') return $();
	if (typeof content === 'string' || typeof content === 'number') return $(paragraphs(String(content)).map(($p) => $p[0]));
	if (Array.isArray(content)) {
		if (content.every((c) => typeof c === 'string')) return $(paragraphs(content).map(($p) => $p[0]));
		return contentNodes({ type: 'elements', items: content });
	}
	if (isItem(content)) return childNode(content);
	const { type, ...rest } = content;
	if (type === 'text') return $(paragraphs(rest.text, rest.muted).map(($p) => $p[0]));
	if (type === 'kv') return childNode({ el: 'kv-list', config: rest });
	if (type === 'elements') {
		const items = (rest.items || []).filter(isItem);
		if (items.length === 1) return childNode(items[0]);
		return $('<div class="fs-nest-stack">').append(items.map(childNode));
	}
	console.error('fs-nest: unknown content', content);
	return $();
}

/** Render content into a container (replacing what is there) and start children. */
export function renderContent($box, content) {
	$box.empty().append(contentNodes(content));
	startChildren($box.children());
	return $box;
}
