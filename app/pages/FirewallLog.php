<?php
/*
 * FirewallLog.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\LogPage;

/* Packets matched by rules with logging enabled. */
final class FirewallLog extends LogPage {
	const ROUTE = '/insights/logs';
	const TITLE = 'Firewall log';
	const LOG = '/v1/logs/firewall';
	const TYPE = 'firewall';
}
