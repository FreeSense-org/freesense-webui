<?php
/*
 * Rfc2136.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\ResourcePage;

/*
 * Network › Dynamic DNS › RFC 2136: updates sent straight to a DNS server
 * with a TSIG key (/v1/services/rfc2136/clients, schema services/rfc2136).
 * Keys are never shown.
 */
final class Rfc2136 extends ResourcePage {
	const ROUTE = '/network/rfc2136';
	const TITLE = 'RFC 2136';
	const RESOURCE = 'services/rfc2136/clients';
	const SCHEMA = 'services/rfc2136';
	const KEY = 'id';
	const LOAD_FIELD = 'fields';

	protected function noun(): string {
		return gettext('RFC 2136 client');
	}

	protected function sort(): ?array {
		return null;
	}

	protected function columns(): array {
		return DynamicDns::clientColumns(true);
	}

	protected function rowActions(string $key): array {
		$actions = parent::rowActions($key);
		array_splice($actions, 1, 0, array(array('id' => 'update', 'label' => gettext('Update now'), 'icon' => 'arrows-rotate', 'api' => array(
			'method' => 'POST', 'path' => $this->api('/{id}/update'), 'success' => gettext('Update sent')))));
		return $actions;
	}
}
