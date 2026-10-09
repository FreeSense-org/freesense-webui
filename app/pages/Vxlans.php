<?php
/*
 * Vxlans.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\ResourcePage;

/*
 * Network › Assignments › VXLAN: layer 2 networks tunnelled over UDP
 * (/v1/interfaces/vxlans, schema network/vxlans). A VXLAN becomes usable
 * once it is assigned to an interface.
 */
final class Vxlans extends ResourcePage {
	const ROUTE = '/network/vxlan';
	const TITLE = 'VXLAN';
	const RESOURCE = 'interfaces/vxlans';
	const SCHEMA = 'network/vxlans';
	const KEY = 'vxlanif';
	const LOAD_FIELD = 'fields';

	protected function noun(): string {
		return gettext('VXLAN');
	}

	protected function plural(): string {
		return gettext('VXLAN interfaces');
	}

	protected function columns(): array {
		return array(
			array('field' => 'display.interface', 'label' => gettext('Interface'), 'primary' => true, 'mono' => true, 'sortable' => true, 'sub' => 'display.description'),
			array('field' => 'display.vni', 'label' => 'VNI', 'mono' => true, 'sortable' => true),
			array('field' => 'display.parent', 'label' => gettext('Parent')),
			array('field' => 'display.remote', 'label' => gettext('Remote / group'), 'mono' => true),
			array('field' => 'display.local', 'label' => gettext('Local'), 'mono' => true, 'priority' => 3),
			array('field' => 'display.assigned_to', 'label' => gettext('Assigned to')),
		);
	}
}
