<?php
/*
 * Element.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI;

/*
 * One catalogue element with its config, built fluently (see "Builder" in
 * each element's spec.md):
 *
 *   $ui->card(gettext('System'))->icon('server')->action('refresh', gettext('Refresh'), 'rotate-right')
 *      ->content($ui->kvList()->source('/status/system')->every(5));
 *
 * Any option is set with ->option(value) (or ->set('option', value)); a few
 * helpers append to lists. Elements nested as values become {el, config},
 * the shape containers render (card/nest.js).
 */
final class Element implements \JsonSerializable {
	private string $name;
	private array $config = array();
	private array $attrs = array();

	public function __construct(string $name, array $config = array()) {
		$this->name = $name;
		foreach ($config as $k => $v) {
			$this->set((string)$k, $v);
		}
	}

	public function name(): string {
		return $this->name;
	}

	public function config(): array {
		return $this->config;
	}

	public function set(string $key, $value): self {
		$this->config[$key] = self::value($value);
		return $this;
	}

	/* An HTML attribute of the container (id for anchors; never style). */
	public function id(string $id): self {
		$this->attrs['id'] = $id;
		return $this;
	}

	/* ->title('x') sets "title"; ->live() sets "live" to true. */
	public function __call(string $method, array $args): self {
		return $this->set($method, $args ? $args[0] : true);
	}

	/* Action {id, label, icon, href}: page-header, card, section, toolbar. */
	public function action(string $id, string $label, ?string $icon = null, ?string $href = null, array $more = array()): self {
		return $this->push('actions', self::action_of($id, $label, $icon, $href, $more));
	}

	public function primary(string $id, string $label, ?string $icon = null, ?string $href = null, array $more = array()): self {
		return $this->set('primary', self::action_of($id, $label, $icon, $href, $more));
	}

	/* page-header: [[label, href], …, [label]] */
	public function breadcrumb(array $items): self {
		return $this->set('breadcrumb', array_map(function ($i) {
			return array_filter(array('label' => (string)$i[0], 'href' => isset($i[1]) ? Url::page((string)$i[1]) : null), 'is_string');
		}, $items));
	}

	public function chip(string $state, string $label, ?string $detail = null): self {
		return $this->push('chips', array_filter(array('state' => $state, 'label' => $label, 'detail' => $detail), 'is_string'));
	}

	/* grid: one item with an optional span. */
	public function add(Element $child, $span = null): self {
		$item = array('el' => $child->name, 'config' => $child->config);
		if ($span !== null) {
			$item['span'] = $span;
		}
		return $this->push('items', $item);
	}

	/* kv-list, data-table: one field / column. */
	public function field(string $name, string $label, ?string $format = null, array $more = array()): self {
		return $this->push('fields', array_filter(array('name' => $name, 'label' => $label, 'format' => $format), 'is_string') + $more);
	}

	public function column(string $name, string $label, ?string $format = null, array $more = array()): self {
		return $this->push('columns', array_filter(array('name' => $name, 'label' => $label, 'format' => $format), 'is_string') + $more);
	}

	private function push(string $key, $value): self {
		$this->config[$key][] = self::value($value);
		return $this;
	}

	private static function action_of(string $id, string $label, ?string $icon, ?string $href, array $more): array {
		$a = array('id' => $id, 'label' => $label);
		if ($icon !== null) {
			$a['icon'] = $icon;
		}
		if ($href !== null) {
			$a['href'] = Url::page($href);
		}
		return $a + $more;
	}

	/* Elements inside values become {el, config}; lists of them stay lists. */
	private static function value($v) {
		if ($v instanceof self) {
			return array('el' => $v->name, 'config' => $v->config);
		}
		if (is_array($v)) {
			return array_map(array(self::class, 'value'), $v);
		}
		return $v;
	}

	public function jsonSerialize(): array {
		return array('el' => $this->name, 'config' => $this->config);
	}

	public function html(): string {
		return Html::element($this->name, $this->config, $this->attrs);
	}
}
