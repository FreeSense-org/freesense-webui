<?php
/*
 * InterfaceGroups.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\ResourcePage;

/*
 * Network › Assignments › Interface groups: several interfaces that share
 * one rule tab (/v1/interfaces/groups, schema network/groups).
 */
final class InterfaceGroups extends ResourcePage {
	const ROUTE = '/network/groups';
	const TITLE = 'Interface groups';
	const RESOURCE = 'interfaces/groups';
	const SCHEMA = 'network/groups';
	const KEY = 'ifname';
	const LOAD_FIELD = 'fields';

	protected function noun(): string {
		return gettext('interface group');
	}

	protected function columns(): array {
		return array(
			array('field' => 'display.name', 'label' => gettext('Name'), 'primary' => true, 'mono' => true, 'sortable' => true, 'sub' => 'display.description'),
			array('field' => 'display.members', 'label' => gettext('Members'), 'format' => 'chips', 'max' => 5),
			array('field' => 'display.in_use_reason', 'label' => gettext('In use'), 'priority' => 3),
		);
	}
}
