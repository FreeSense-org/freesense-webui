<?php
/*
 * DnsResolver.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\SettingsPage;

/*
 * Network › DNS resolver › General: the Unbound resolver's main settings
 * (GET/PUT /v1/services/dns-resolver, schema services/dns_resolver). Saved
 * changes wait for Apply, like every DNS resolver page.
 */
final class DnsResolver extends SettingsPage {
	const ROUTE = '/network/dns-resolver';
	const TITLE = 'General';
	const RESOURCE = 'services/dns-resolver';
	const SCHEMA = 'services/dns_resolver';
	const PENDING = '/v1/services/dns-resolver/pending';
	const APPLY_PATH = '/v1/services/dns-resolver/apply';

	public function subtitle(): string {
		return gettext('The DNS resolver answers DNS queries for your networks and resolves names itself, from the root servers or through upstream servers.');
	}
}
