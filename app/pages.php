<?php
/*
 * pages.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/* Built pages. Navigation entries without a page here show the "not built yet" page. */

return array(
	FreeSense\WebUI\Pages\Dashboard::class,
	FreeSense\WebUI\Pages\Profile::class,
	FreeSense\WebUI\Pages\Aliases::class,
	FreeSense\WebUI\Pages\Ntp::class,
	FreeSense\WebUI\Pages\FirewallLog::class,
	FreeSense\WebUI\Pages\SystemLog::class,
	FreeSense\WebUI\Pages\DhcpLog::class,
	FreeSense\WebUI\Pages\DnsLog::class,
	FreeSense\WebUI\Pages\VpnLog::class,
	FreeSense\WebUI\Pages\Gateways::class,
	FreeSense\WebUI\Pages\Services::class,
	FreeSense\WebUI\Pages\Arp::class,
);
