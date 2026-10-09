<?php
/*
 * Ui.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI;

/*
 * The page builder. Pages compose catalogue elements only (RULES R1):
 * $ui->pageHeader('Title') creates a page-header element, $ui->kvList() a
 * kv-list, and so on; an element missing from the catalogue (the engine's
 * ui/manifest.json) is an error, never raw markup. A string first argument
 * is the element's title.
 *
 * $ui->add() places an element on the page; elements passed to another
 * element (content, grid items) are nested instead.
 */
final class Ui {
	private array $catalogue;
	/** @var Element[] */
	private array $page = array();

	public function __construct(array $catalogue) {
		$this->catalogue = array_flip($catalogue);
	}

	public function el(string $name, array $config = array()): Element {
		if (!isset($this->catalogue[$name])) {
			throw new \LogicException("Element '{$name}' is not in the catalogue of @freesense/ui (add it to the engine first).");
		}
		return new Element($name, $config);
	}

	/* $ui->pageHeader('Peers') → el('page-header', ['title' => 'Peers']) */
	public function __call(string $method, array $args): Element {
		$name = strtolower((string)preg_replace('/(?<!^)[A-Z]/', '-$0', $method));
		$e = $this->el($name);
		if (isset($args[0]) && is_string($args[0])) {
			$e->set('title', $args[0]);
		} elseif (isset($args[0]) && is_array($args[0])) {
			foreach ($args[0] as $k => $v) {
				$e->set((string)$k, $v);
			}
		}
		return $e;
	}

	/* Place elements on the page, in order. */
	public function add(Element ...$elements): self {
		foreach ($elements as $e) {
			$this->page[] = $e;
		}
		return $this;
	}

	/** @return Element[] */
	public function elements(): array {
		return $this->page;
	}

	public function html(): string {
		return implode("\n", array_map(function (Element $e) {
			return $e->html();
		}, $this->page));
	}
}
