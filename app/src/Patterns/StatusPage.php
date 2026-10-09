<?php
/*
 * StatusPage.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Patterns;

use FreeSense\WebUI\Page;
use FreeSense\WebUI\Ui;

/*
 * Read-only live status as a table (gateways, services, ARP, leases…):
 * search, sorting, live refresh, cards on phones.
 *
 *   final class Gateways extends StatusPage {
 *       const ROUTE = '/insights/gateways';
 *       const SOURCE = '/v1/status/gateways';
 *       const KEY = 'name';
 *       protected function columns(): array { return [...]; }
 *   }
 */
abstract class StatusPage extends Page {
	/* API path; data is the list of rows. */
	const SOURCE = '';
	/* Row id field. */
	const KEY = 'id';
	/* Live refresh in seconds (0: load once). */
	const EVERY = 10;

	/* data-table columns (data-table/spec.md, Column). */
	abstract protected function columns(): array;

	public function subtitle(): string {
		return '';
	}

	protected function rowActions(): array {
		return array();
	}

	/* data-table empty state. */
	protected function empty(): array {
		return array('icon' => 'inbox', 'title' => gettext('Nothing to show'));
	}

	protected function sort(): ?array {
		return null;
	}

	public function build(Ui $ui): void {
		$table = $ui->dataTable()
			->source(array('path' => static::SOURCE))
			->key(static::KEY)
			->label($this->title())
			->columns($this->columns())
			->every(static::EVERY)
			->toolbar(array('search' => true))
			->paging(array('mode' => 'client', 'size' => 50))
			->empty($this->empty());
		if ($this->rowActions()) {
			$table->rowActions($this->rowActions());
		}
		if ($this->sort() !== null) {
			$table->sort($this->sort());
		}
		$header = $this->header($ui);
		if ($this->subtitle() !== '') {
			$header->subtitle($this->subtitle());
		}
		$ui->add($header, $table);
	}
}
