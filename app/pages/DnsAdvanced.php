<?php
/*
 * DnsAdvanced.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\SettingsPage;

/*
 * Network › DNS resolver › Advanced: privacy, caching and tuning
 * (GET/PUT /v1/services/dns-resolver/advanced, schema
 * services/dns_resolver_advanced).
 */
final class DnsAdvanced extends SettingsPage {
	const ROUTE = '/network/dns-advanced';
	const TITLE = 'Advanced';
	const RESOURCE = 'services/dns-resolver/advanced';
	const SCHEMA = 'services/dns_resolver_advanced';
	const PENDING = '/v1/services/dns-resolver/pending';
	const APPLY_PATH = '/v1/services/dns-resolver/apply';
	const APPLY_MATCH = 'services/dns-resolver';

	public function subtitle(): string {
		return gettext('Privacy, caching and performance of the DNS resolver. The defaults suit most networks.');
	}
}
