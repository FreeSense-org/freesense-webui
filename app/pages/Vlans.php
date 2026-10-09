<?php
/*
 * Vlans.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\ResourcePage;

/*
 * Network › Assignments › VLANs (/v1/interfaces/vlans, schema network/vlans).
 * A VLAN becomes usable once it is assigned to an interface.
 */
final class Vlans extends ResourcePage {
	const ROUTE = '/network/vlans';
	const TITLE = 'VLANs';
	const RESOURCE = 'interfaces/vlans';
	const SCHEMA = 'network/vlans';
	const KEY = 'vlanif';
	const LOAD_FIELD = 'fields';

	protected function noun(): string {
		return gettext('VLAN');
	}

	protected function columns(): array {
		return array(
			array('field' => 'display.interface', 'label' => gettext('Interface'), 'primary' => true, 'mono' => true, 'sortable' => true, 'sub' => 'display.description'),
			array('field' => 'display.parent', 'label' => gettext('Parent'), 'sortable' => true),
			array('field' => 'display.tag', 'label' => gettext('Tag'), 'mono' => true, 'sortable' => true),
			array('field' => 'display.priority', 'label' => gettext('Priority'), 'priority' => 3),
			array('field' => 'display.assigned_to', 'label' => gettext('Assigned to')),
		);
	}
}
