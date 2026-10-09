<?php
/*
 * DnsAcls.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\ResourcePage;

/*
 * Network › DNS resolver › Access lists: which networks may query the
 * resolver (/v1/services/dns-resolver/access-lists, schema
 * services/dns_access_list). Ids are positions.
 */
final class DnsAcls extends ResourcePage {
	const ROUTE = '/network/dns-acls';
	const TITLE = 'Access lists';
	const RESOURCE = 'services/dns-resolver/access-lists';
	const SCHEMA = 'services/dns_access_list';
	const KEY = 'id';
	const LOAD_FIELD = 'fields';
	const PENDING = '/v1/services/dns-resolver/pending';
	const APPLY_PATH = '/v1/services/dns-resolver/apply';

	protected function noun(): string {
		return gettext('access list');
	}

	protected function sort(): ?array {
		return array('field' => 'display.name', 'dir' => 'asc');
	}

	protected function columns(): array {
		$tones = array();
		foreach (array('Allow' => 'ok', 'Allow Snoop' => 'info', 'Deny' => 'crit', 'Refuse' => 'warn', 'Deny Nonlocal' => 'crit', 'Refuse Nonlocal' => 'warn') as $label => $tone) {
			$tones[$label] = array('label' => gettext($label), 'tone' => $tone);
		}
		return array(
			array('field' => 'display.name', 'label' => gettext('Name'), 'primary' => true, 'sortable' => true, 'sub' => 'display.description'),
			array('field' => 'display.action', 'label' => gettext('Action'), 'format' => 'badge', 'badgeMap' => $tones),
			array('field' => 'display.networks', 'label' => gettext('Networks'), 'format' => 'chips', 'max' => 4, 'mono' => true),
		);
	}
}
