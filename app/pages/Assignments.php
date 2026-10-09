<?php
/*
 * Assignments.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Page;
use FreeSense\WebUI\Ui;
use FreeSense\WebUI\Url;

/*
 * Network › Assignments: which network port each interface uses
 * (/v1/interfaces/assignments). Adding, changing and removing an
 * assignment reconfigures the interface at once, like the 1.x page, so every
 * write sends {"confirm": true} after the user confirmed it in a dialog.
 * WAN and LAN cannot be removed here.
 */
final class Assignments extends Page {
	const ROUTE = '/network/assignments';
	const TITLE = 'Assignments';

	public function build(Ui $ui): void {
		$api = '/v1/interfaces/assignments';
		$port = array('name' => 'port', 'type' => 'select', 'label' => gettext('Network port'), 'required' => true);
		$add = array(
			'method' => 'POST',
			'path' => $api,
			'text' => gettext('The port becomes a new interface (OPT1, OPT2, …), disabled until you configure it.'),
			'fields' => array($port + array('optionsSource' => array('path' => $api, 'from' => 'meta.available_ports'))),
			'body' => array('confirm' => true),
			'submitLabel' => gettext('Add interface'),
			'success' => gettext('Interface added'),
		);
		$table = $ui->dataTable()
			->source(array('path' => $api))
			->key('interface')
			->label(gettext('Interface assignments'))
			->reloadOn('fs:saved')
			->columns(array(
				array('field' => 'display.enabled', 'label' => gettext('Status'), 'format' => 'status', 'variant' => 'dot', 'width' => '7rem', 'statusMap' => array(
					'true' => array('state' => 'ok', 'label' => gettext('Enabled')), 'false' => array('state' => 'neutral', 'label' => gettext('Disabled')))),
				array('field' => 'display.interface', 'label' => gettext('Interface'), 'primary' => true),
				array('field' => 'display.port', 'label' => gettext('Network port'), 'mono' => true),
				array('field' => 'display.addresses', 'label' => gettext('Addressing'), 'format' => 'chips', 'max' => 3),
				array('field' => 'display.in_use_reason', 'label' => gettext('In use'), 'priority' => 3),
			))
			->rowLink(Url::page('/network/interfaces/edit/{interface}'))
			->rowActions(array(
				array('id' => 'edit', 'label' => gettext('Configure'), 'icon' => 'pen', 'inline' => true, 'href' => Url::page('/network/interfaces/edit/{interface}')),
				array('id' => 'port', 'label' => gettext('Change port'), 'icon' => 'ethernet', 'form' => array(
					'title' => gettext('Network port of {display.interface}'),
					'text' => gettext('The interface is reconfigured on the new port at once. Its traffic stops briefly.'),
					'method' => 'PUT',
					'path' => $api . '/{interface}',
					'fields' => array($port + array('optionsSource' => array('path' => $api, 'from' => 'meta.ports'))),
					'values' => array('port' => '{port}'),
					'body' => array('confirm' => true),
					'submitLabel' => gettext('Change port'),
					'success' => gettext('Port changed'),
				)),
				array('id' => 'remove', 'label' => gettext('Remove'), 'icon' => 'trash', 'danger' => true, 'when' => array('field' => 'removable', 'value' => true), 'api' => array(
					'method' => 'DELETE',
					'path' => $api . '/{interface}?confirm=true',
					'success' => gettext('Interface removed'),
					'confirm' => array('title' => gettext('Remove {display.interface}?'), 'typed' => '{display.interface}', 'confirmLabel' => gettext('Remove'), 'danger' => true,
					    'text' => gettext('The interface and its settings are removed and the port becomes free. Rules, DHCP and other services that use it must be removed first.')),
				)),
			));
		$ui->add(
			$this->header($ui)->subtitle(gettext('Assign network ports, VLANs, bridges and tunnels to interfaces. Changes take effect at once.'))
				->primary('add', gettext('Add interface'), 'plus', null, array('form' => $add)),
			$ui->applyBar()
				->source(array('path' => $api . '/pending'))
				->apply(array('method' => 'POST', 'path' => $api . '/apply', 'body' => array('confirm' => true)))
				->text(gettext('Interface changes need to be applied'))
				->detail(gettext('Applying reloads the interfaces; when the port layout changed the firewall restarts.'))
				->match('/interfaces/assignments'),
			$table
		);
	}
}
