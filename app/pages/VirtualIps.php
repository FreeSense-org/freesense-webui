<?php
/*
 * VirtualIps.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\ResourcePage;

/*
 * Security › Virtual IPs: extra addresses on an interface (IP alias, CARP
 * for high availability, proxy ARP, other), from /v1/firewall/virtual-ips
 * with the firewall/virtual_ips schema. Changes wait behind the apply bar.
 */
final class VirtualIps extends ResourcePage {
	const ROUTE = '/security/virtual-ips';
	const TITLE = 'Virtual IPs';
	const RESOURCE = 'firewall/virtual-ips';
	const SCHEMA = 'firewall/virtual_ips';
	const KEY = 'id';
	const APPLY = 'virtual_ips';
	const LOAD_FIELD = 'fields';

	private const TYPES = array(
		'ipalias' => array('IP alias', 'neutral'),
		'carp' => array('CARP', 'accent'),
		'proxyarp' => array('Proxy ARP', 'info'),
		'other' => array('Other', 'neutral'),
	);

	protected function noun(): string {
		return gettext('virtual IP');
	}

	public function title(): string {
		return (($this->params['view'] ?? 'list') === 'edit') ? gettext('Edit virtual IP') : parent::title();
	}

	protected function sort(): ?array {
		return null;
	}

	protected function columns(): array {
		$badges = array();
		foreach (self::TYPES as $mode => $b) {
			$badges[$mode] = array('label' => gettext($b[0]), 'tone' => $b[1]);
		}
		return array(
			array('field' => 'display.address', 'label' => gettext('Address'), 'primary' => true, 'mono' => true, 'sortable' => true),
			array('field' => 'mode', 'label' => gettext('Type'), 'format' => 'badge', 'badgeMap' => $badges, 'sortable' => true),
			array('field' => 'display.interface', 'label' => gettext('Interface'), 'sortable' => true),
			array('field' => 'display.vhid', 'label' => 'VHID', 'mono' => true, 'priority' => 3),
			array('field' => 'display.description', 'label' => gettext('Description'), 'priority' => 3),
		);
	}

	protected function filters(): array {
		$options = array();
		foreach (self::TYPES as $mode => $b) {
			$options[] = array('value' => $mode, 'label' => gettext($b[0]));
		}
		return array(array(
			array('id' => 'mode', 'label' => gettext('Type'), 'all' => gettext('All types'), 'options' => $options),
			array('id' => 'mode', 'field' => 'mode'),
		));
	}
}
