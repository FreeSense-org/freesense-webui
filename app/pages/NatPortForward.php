<?php
/*
 * NatPortForward.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\RuleListPage;

/*
 * Security › NAT › Port forward: redirect traffic arriving on an interface
 * to an internal host (/v1/firewall/nat/port-forwards, schema
 * firewall/nat_port_forwards). A port forward usually comes with an
 * associated filter rule that the firewall keeps in step.
 */
final class NatPortForward extends RuleListPage {
	const ROUTE = '/security/nat';
	const TITLE = 'Port forward';
	const API = '/v1/firewall/nat/port-forwards';
	const SCHEMA = 'firewall/nat_port_forwards';
	const APPLY = 'nat';
	const APPLY_PATH = '/v1/firewall/nat/apply';
	const ICON = 'arrow-right-to-bracket';

	protected function noun(): string {
		return gettext('port forward');
	}

	protected function subtitle(): string {
		return gettext('Send traffic arriving on an interface to a host inside your network. The first matching rule is used; drag to change the order.');
	}

	protected function emptyText(): string {
		return gettext('Port forwards make a service on an internal host reachable from outside, e.g. a web server.');
	}

	protected function defaults(): array {
		return array('interface' => 'wan', 'ipprotocol' => 'inet', 'proto' => 'tcp', 'srctype' => 'any', 'dsttype' => 'wanip');
	}

	protected function columns(): array {
		$rule = array(
			'associated' => array('label' => gettext('Linked rule'), 'tone' => 'info', 'icon' => 'link'),
			'pass' => array('label' => gettext('Pass'), 'tone' => 'ok', 'icon' => 'circle-check'),
			'none' => array('label' => gettext('No rule'), 'tone' => 'neutral', 'icon' => 'minus'),
		);
		return array(
			array('field' => 'display.description', 'label' => gettext('Description'), 'primary' => true, 'sub' => 'display.protocol'),
			array('field' => 'display.interface', 'label' => gettext('Interface')),
			array('field' => 'display.source', 'label' => gettext('Source'), 'mono' => true, 'sub' => 'display.source_ports', 'priority' => 3),
			array('field' => 'display.destination', 'label' => gettext('Destination'), 'mono' => true, 'sub' => 'display.destination_ports'),
			array('field' => 'display.target', 'label' => gettext('Redirect to'), 'mono' => true, 'sub' => 'display.target_ports'),
			array('field' => 'display.filter_rule', 'label' => gettext('Filter rule'), 'format' => 'badge', 'badgeMap' => $rule, 'priority' => 3),
		);
	}
}
