<?php
/*
 * DhcpLog.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\LogPage;

/* Leases handed out, renewed and released. */
final class DhcpLog extends LogPage {
	const ROUTE = '/insights/logs-dhcp';
	const TITLE = 'DHCP log';
	const LOG = '/v1/logs/dhcpd';
}
