<?php
/*
 * Aliases.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\ResourcePage;

/* Named lists of hosts, networks, ports and URLs for firewall and NAT rules. */
final class Aliases extends ResourcePage {
	const ROUTE = '/security/aliases';
	const TITLE = 'Aliases';
	const RESOURCE = 'firewall/aliases';
	const KEY = 'name';
	const APPLY = 'aliases';

	private const TYPES = array('host' => 'Host(s)', 'network' => 'Network(s)', 'port' => 'Port(s)', 'url' => 'URL (IPs)',
	    'url_ports' => 'URL (ports)', 'urltable' => 'URL table (IPs)', 'urltable_ports' => 'URL table (ports)');

	protected function noun(): string {
		return gettext('alias');
	}

	protected function plural(): string {
		return gettext('aliases');
	}

	protected function columns(): array {
		$badges = array();
		foreach (self::TYPES as $type => $label) {
			$badges[$type] = array('label' => gettext($label), 'tone' => (strpos($type, 'url') === 0) ? 'info' : 'neutral');
		}
		return array(
			array('field' => 'name', 'label' => gettext('Name'), 'primary' => true, 'mono' => true, 'sortable' => true),
			array('field' => 'type', 'label' => gettext('Type'), 'format' => 'badge', 'badgeMap' => $badges, 'sortable' => true),
			array('field' => 'entries', 'label' => gettext('Values'), 'format' => 'chips', 'itemField' => 'address', 'max' => 4, 'mono' => true),
			array('field' => 'description', 'label' => gettext('Description'), 'priority' => 3),
		);
	}

	protected function filters(): array {
		$options = array();
		foreach (self::TYPES as $type => $label) {
			$options[] = array('value' => $type, 'label' => gettext($label));
		}
		return array(array(
			array('id' => 'type', 'label' => gettext('Type'), 'all' => gettext('All types'), 'options' => $options),
			array('id' => 'type', 'field' => 'type'),
		));
	}
}
