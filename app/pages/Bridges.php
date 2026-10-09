<?php
/*
 * Bridges.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\ResourcePage;

/*
 * Network › Assignments › Bridges (/v1/interfaces/bridges, schema
 * network/bridges).
 */
final class Bridges extends ResourcePage {
	const ROUTE = '/network/bridges';
	const TITLE = 'Bridges';
	const RESOURCE = 'interfaces/bridges';
	const SCHEMA = 'network/bridges';
	const KEY = 'bridgeif';
	const LOAD_FIELD = 'fields';

	protected function noun(): string {
		return gettext('bridge');
	}

	protected function columns(): array {
		return array(
			array('field' => 'display.interface', 'label' => gettext('Interface'), 'primary' => true, 'mono' => true, 'sortable' => true, 'sub' => 'display.description'),
			array('field' => 'display.members', 'label' => gettext('Members'), 'format' => 'chips', 'max' => 4),
			array('field' => 'display.stp', 'label' => 'STP', 'priority' => 3),
			array('field' => 'display.assigned_to', 'label' => gettext('Assigned to')),
		);
	}
}
