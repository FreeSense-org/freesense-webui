<?php
/*
 * DnsHosts.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\ResourcePage;

/*
 * Network › DNS resolver › Host overrides: names the resolver answers itself
 * (/v1/services/dns-resolver/host-overrides, schema
 * services/dns_host_override). Ids are positions.
 */
final class DnsHosts extends ResourcePage {
	const ROUTE = '/network/dns-hosts';
	const TITLE = 'Host overrides';
	const RESOURCE = 'services/dns-resolver/host-overrides';
	const SCHEMA = 'services/dns_host_override';
	const KEY = 'id';
	const LOAD_FIELD = 'fields';
	const PENDING = '/v1/services/dns-resolver/pending';
	const APPLY_PATH = '/v1/services/dns-resolver/apply';

	protected function noun(): string {
		return gettext('host override');
	}

	protected function sort(): ?array {
		return array('field' => 'display.host', 'dir' => 'asc');
	}

	protected function columns(): array {
		return array(
			array('field' => 'display.host', 'label' => gettext('Host'), 'primary' => true, 'mono' => true, 'sortable' => true, 'sub' => 'display.description'),
			array('field' => 'display.addresses', 'label' => gettext('Addresses'), 'format' => 'chips', 'max' => 3, 'mono' => true),
			array('field' => 'display.aliases', 'label' => gettext('Aliases'), 'format' => 'chips', 'max' => 3, 'mono' => true, 'priority' => 3),
		);
	}
}
