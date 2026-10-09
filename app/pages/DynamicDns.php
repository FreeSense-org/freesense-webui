<?php
/*
 * DynamicDns.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\ResourcePage;

/*
 * Network › Dynamic DNS: clients that keep a DNS name pointed at a changing
 * address (/v1/services/dyndns/clients, schema services/dyndns). Ids are
 * positions; passwords are never shown.
 */
final class DynamicDns extends ResourcePage {
	const ROUTE = '/network/ddns';
	const TITLE = 'Dynamic DNS';
	const RESOURCE = 'services/dyndns/clients';
	const SCHEMA = 'services/dyndns';
	const KEY = 'id';
	const LOAD_FIELD = 'fields';

	protected function noun(): string {
		return gettext('dynamic DNS client');
	}

	protected function sort(): ?array {
		return null;
	}

	protected function columns(): array {
		return self::clientColumns(false);
	}

	/* The list columns of Dynamic DNS and RFC 2136 clients. */
	public static function clientColumns(bool $rfc2136): array {
		$states = array(
			'ok' => array('state' => 'ok', 'label' => gettext('Up to date')),
			'fail' => array('state' => 'crit', 'label' => gettext('Update failed')),
			'unknown' => array('state' => 'neutral', 'label' => gettext('Unknown')),
		);
		$cols = array(
			array('field' => $rfc2136 ? 'display.status_ipv4' : 'display.status', 'label' => gettext('Status'), 'format' => 'status', 'variant' => 'dot', 'width' => '9rem', 'statusMap' => $states),
			array('field' => 'display.hostname', 'label' => gettext('Host name'), 'primary' => true, 'mono' => true, 'sub' => 'display.description'),
			$rfc2136 ? array('field' => 'display.server', 'label' => gettext('Server'), 'mono' => true) : array('field' => 'display.service', 'label' => gettext('Service')),
			array('field' => 'display.interface', 'label' => gettext('Interface')),
			array('field' => 'display.cached_ip', 'label' => gettext('Address'), 'mono' => true),
		);
		return $cols;
	}

	protected function rowActions(string $key): array {
		$actions = parent::rowActions($key);
		array_splice($actions, 1, 0, array(array('id' => 'update', 'label' => gettext('Update now'), 'icon' => 'arrows-rotate', 'api' => array(
			'method' => 'POST', 'path' => $this->api('/{id}/update'), 'success' => gettext('Update sent')))));
		return $actions;
	}
}
