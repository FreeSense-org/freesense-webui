<?php
/*
 * StaticRoutes.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\ResourcePage;
use FreeSense\WebUI\Ui;

/*
 * Network › Gateways › Static routes (/v1/routing/static-routes, schema
 * routing/static_routes). Ids are positions.
 */
final class StaticRoutes extends ResourcePage {
	const ROUTE = '/network/routes';
	const TITLE = 'Static routes';
	const RESOURCE = 'routing/static-routes';
	const SCHEMA = 'routing/static_routes';
	const KEY = 'id';
	const LOAD_FIELD = 'fields';
	const PENDING = '/v1/routing/pending';
	const APPLY_PATH = '/v1/routing/apply';

	protected function noun(): string {
		return gettext('static route');
	}

	protected function sort(): ?array {
		return null;
	}

	protected function applyBar(Ui $ui): \FreeSense\WebUI\Element {
		return parent::applyBar($ui)->match('/routing');
	}

	protected function columns(): array {
		return array(
			array('field' => 'display.enabled', 'label' => gettext('Status'), 'format' => 'status', 'variant' => 'dot', 'width' => '7rem', 'statusMap' => array(
				'true' => array('state' => 'ok', 'label' => gettext('Enabled')), 'false' => array('state' => 'neutral', 'label' => gettext('Disabled')))),
			array('field' => 'display.network', 'label' => gettext('Network'), 'primary' => true, 'mono' => true, 'sortable' => true, 'sub' => 'display.description'),
			array('field' => 'display.gateway', 'label' => gettext('Gateway'), 'mono' => true),
			array('field' => 'display.interface', 'label' => gettext('Interface')),
		);
	}
}
