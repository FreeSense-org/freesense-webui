<?php
/*
 * Services.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\StatusPage;

/* Which services run. */
final class Services extends StatusPage {
	const ROUTE = '/insights/services';
	const TITLE = 'Services';
	const SOURCE = '/v1/status/services';
	const KEY = 'name';

	public function subtitle(): string {
		return gettext('The services of the system and of installed packages, and whether they run.');
	}

	protected function columns(): array {
		return array(
			array('field' => 'description', 'label' => gettext('Service'), 'primary' => true, 'sortable' => true, 'sub' => 'name'),
			array('field' => 'running', 'label' => gettext('Status'), 'format' => 'status', 'variant' => 'pill', 'sortable' => true, 'statusMap' => array(
				'true' => array('state' => 'ok', 'label' => gettext('Running')),
				'false' => array('state' => 'crit', 'label' => gettext('Stopped')),
			)),
		);
	}

	protected function sort(): ?array {
		return array('field' => 'description', 'dir' => 'asc');
	}
}
