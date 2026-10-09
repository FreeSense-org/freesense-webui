<?php
/*
 * Gifs.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\ResourcePage;

/*
 * Network › Assignments › GIF: generic tunnel interfaces (IPv6 over IPv4
 * and the like; /v1/interfaces/gifs, schema network/gifs).
 */
final class Gifs extends ResourcePage {
	const ROUTE = '/network/gif';
	const TITLE = 'GIF';
	const RESOURCE = 'interfaces/gifs';
	const SCHEMA = 'network/gifs';
	const KEY = 'gifif';
	const LOAD_FIELD = 'fields';

	protected function noun(): string {
		return gettext('GIF tunnel');
	}

	protected function columns(): array {
		return array(
			array('field' => 'gifif', 'label' => gettext('Interface'), 'primary' => true, 'mono' => true, 'sortable' => true, 'sub' => 'display.description'),
			array('field' => 'display.parent', 'label' => gettext('Parent')),
			array('field' => 'display.remote', 'label' => gettext('Remote'), 'mono' => true),
			array('field' => 'display.tunnel', 'label' => gettext('Tunnel addresses'), 'format' => 'chips', 'mono' => true),
			array('field' => 'display.assigned_to', 'label' => gettext('Assigned to'), 'priority' => 3),
		);
	}
}
