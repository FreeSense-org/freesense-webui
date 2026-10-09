<?php
/*
 * Gres.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\ResourcePage;

/*
 * Network › Assignments › GRE: GRE tunnel interfaces (/v1/interfaces/gres,
 * schema network/gres).
 */
final class Gres extends ResourcePage {
	const ROUTE = '/network/gre';
	const TITLE = 'GRE';
	const RESOURCE = 'interfaces/gres';
	const SCHEMA = 'network/gres';
	const KEY = 'greif';
	const LOAD_FIELD = 'fields';

	protected function noun(): string {
		return gettext('GRE tunnel');
	}

	protected function columns(): array {
		return array(
			array('field' => 'greif', 'label' => gettext('Interface'), 'primary' => true, 'mono' => true, 'sortable' => true, 'sub' => 'display.description'),
			array('field' => 'display.parent', 'label' => gettext('Parent')),
			array('field' => 'display.remote', 'label' => gettext('Remote'), 'mono' => true),
			array('field' => 'display.tunnel', 'label' => gettext('Tunnel addresses'), 'format' => 'chips', 'mono' => true),
			array('field' => 'display.assigned_to', 'label' => gettext('Assigned to'), 'priority' => 3),
		);
	}
}
