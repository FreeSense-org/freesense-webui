<?php
/*
 * DnsLog.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\LogPage;

/* Messages from the DNS resolver (Unbound). */
final class DnsLog extends LogPage {
	const ROUTE = '/insights/logs-dns';
	const TITLE = 'DNS resolver log';
	const LOG = '/v1/logs/resolver';
}
