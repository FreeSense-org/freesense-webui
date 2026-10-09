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
	FreeSense\WebUI\Pages\Rules::class,
	FreeSense\WebUI\Pages\NatPortForward::class,
	FreeSense\WebUI\Pages\NatOutbound::class,
	FreeSense\WebUI\Pages\NatOneToOne::class,
	FreeSense\WebUI\Pages\NatNpt::class,
	FreeSense\WebUI\Pages\Schedules::class,
	FreeSense\WebUI\Pages\VirtualIps::class,
	FreeSense\WebUI\Pages\UpdateCenter::class,
	FreeSense\WebUI\Pages\Interfaces::class,
	FreeSense\WebUI\Pages\Assignments::class,
	FreeSense\WebUI\Pages\Vlans::class,
	FreeSense\WebUI\Pages\Qinqs::class,
	FreeSense\WebUI\Pages\Vxlans::class,
	FreeSense\WebUI\Pages\Bridges::class,
	FreeSense\WebUI\Pages\Laggs::class,
	FreeSense\WebUI\Pages\Gifs::class,
	FreeSense\WebUI\Pages\Gres::class,
	FreeSense\WebUI\Pages\InterfaceGroups::class,
	FreeSense\WebUI\Pages\RoutingGateways::class,
	FreeSense\WebUI\Pages\GatewayGroups::class,
	FreeSense\WebUI\Pages\StaticRoutes::class,
	FreeSense\WebUI\Pages\DynamicDns::class,
	FreeSense\WebUI\Pages\Rfc2136::class,
	FreeSense\WebUI\Pages\RouterAdvertisements::class,
	FreeSense\WebUI\Pages\DhcpServer::class,
	FreeSense\WebUI\Pages\Dhcpv6Server::class,
	FreeSense\WebUI\Pages\DhcpRelay::class,
	FreeSense\WebUI\Pages\Dhcpv6Relay::class,
	FreeSense\WebUI\Pages\DhcpSettings::class,
	FreeSense\WebUI\Pages\Dhcpv6Settings::class,
	FreeSense\WebUI\Pages\DnsResolver::class,
	FreeSense\WebUI\Pages\DnsHosts::class,
	FreeSense\WebUI\Pages\DnsDomains::class,
	FreeSense\WebUI\Pages\DnsAcls::class,
	FreeSense\WebUI\Pages\DnsAdvanced::class,
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
