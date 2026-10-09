<?php
/*
 * SettingsPage.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Patterns;

use FreeSense\WebUI\Page;
use FreeSense\WebUI\Ui;

/*
 * One settings object as a schema form (GET, PUT, inline errors, dirty
 * guard, sticky save bar). Fields, labels, help and rules come from
 * GET /api/v1/schema/{SCHEMA}.
 *
 *   final class Ntp extends SettingsPage {
 *       const ROUTE = '/services/ntp';
 *       const RESOURCE = 'services/ntp';
 *   }
 */
abstract class SettingsPage extends Page {
	/* API path below /v1 ('services/ntp' → GET/PUT /v1/services/ntp). */
	const RESOURCE = '';
	/* Schema name when it differs from RESOURCE. */
	const SCHEMA = null;
	/* Saved changes that wait for Apply: the pending route ({pending: bool}) and the apply route, or null. */
	const PENDING = null;
	const APPLY_PATH = null;
	/* The API path the apply bar watches for writes (default: RESOURCE). */
	const APPLY_MATCH = null;

	public function subtitle(): string {
		return '';
	}

	public function build(Ui $ui): void {
		$path = '/v1/' . static::RESOURCE;
		$header = $this->header($ui);
		if ($this->subtitle() !== '') {
			$header->subtitle($this->subtitle());
		}
		$ui->add($header);
		if (static::PENDING !== null) {
			$ui->add($ui->applyBar()
				->source(array('path' => static::PENDING))
				->apply(array('method' => 'POST', 'path' => static::APPLY_PATH))
				->match('/' . (static::APPLY_MATCH ?? static::RESOURCE)));
		}
		$save = array('method' => 'PUT', 'path' => $path);
		if (static::PENDING !== null) {
			$save['pending'] = true;
		}
		$ui->add($ui->form()
			->schemaSource(array('path' => '/v1/schema/' . (static::SCHEMA ?? static::RESOURCE)))
			->load(array('path' => $path))
			->save($save)
			->label($this->title()));
	}
}
