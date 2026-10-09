<?php
/*
 * DnsDomains.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\ResourcePage;

/*
 * Network › DNS resolver › Domain overrides: domains whose queries go to a
 * specific server (/v1/services/dns-resolver/domain-overrides, schema
 * services/dns_domain_override). Ids are positions.
 */
final class DnsDomains extends ResourcePage {
	const ROUTE = '/network/dns-domains';
	const TITLE = 'Domain overrides';
	const RESOURCE = 'services/dns-resolver/domain-overrides';
	const SCHEMA = 'services/dns_domain_override';
	const KEY = 'id';
	const LOAD_FIELD = 'fields';
	const PENDING = '/v1/services/dns-resolver/pending';
	const APPLY_PATH = '/v1/services/dns-resolver/apply';

	protected function noun(): string {
		return gettext('domain override');
	}

	protected function sort(): ?array {
		return array('field' => 'display.domain', 'dir' => 'asc');
	}

	protected function columns(): array {
		return array(
			array('field' => 'display.domain', 'label' => gettext('Domain'), 'primary' => true, 'mono' => true, 'sortable' => true, 'sub' => 'display.description'),
			array('field' => 'display.server', 'label' => gettext('Server'), 'mono' => true),
			array('field' => 'display.tls', 'label' => 'TLS', 'format' => 'bool', 'priority' => 3),
		);
	}
}
