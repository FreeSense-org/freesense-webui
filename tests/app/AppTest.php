<?php
/*
 * AppTest.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/* Tests of the PHP app without a firewall: php tests/app/AppTest.php */

define('FS_WEBUI_NO_BACKEND', true);
putenv('FS_WEBUI_PUBLIC=' . dirname(__DIR__, 2) . '/dist/public');
require dirname(__DIR__, 2) . '/app/bootstrap.php';

use FreeSense\WebUI\{Assets, Element, Html, Nav, Shell, Ui, Url};

function gettext($s) { return $s; }
function config_get_path($p, $d = null) { return array('system/hostname' => 'fw01', 'system/domain' => 'home.arpa')[$p] ?? $d; }

$failed = 0;
function t($ok, $what) {
	global $failed;
	if (!$ok) {
		$failed++;
		fwrite(STDERR, "FAIL: {$what}\n");
	}
}
function throws(callable $f) {
	try {
		$f();
	} catch (Throwable $e) {
		return true;
	}
	return false;
}

/* Url */
t(FS_WEBUI_BASE === '/next', 'pages live under /next next to the 1.x GUI');
t(Url::page('/') === '/next/' && Url::page('/security/aliases') === '/next/security/aliases', 'routes become page URLs');
t(Url::page('/next/me') === '/next/me' && Url::page('/api/v1/me') === '/api/v1/me' && Url::page('https://docs.freesense.org/x') === 'https://docs.freesense.org/x',
    'page URLs, API paths and external links pass unchanged');
t(Url::route('/next') === '/' && Url::route('/next/') === '/' && Url::route('/next/vpn/ipsec/') === '/vpn/ipsec', 'request paths become routes');
t(Url::route('/nextdoor') === null && Url::route('/index.php') === null && Url::route('/next/a.php') === null && Url::route('/next/x%2f') === null,
    'paths outside the WebUI, or with characters routes never use, are not routes');
t(Url::next('/next/vpn/ipsec?x=1') === '/next/vpn/ipsec?x=1', 'a WebUI page is a valid sign-in target');
foreach (array('', 'https://evil.example/', '//evil.example/next/', '/\\evil.example', '/index.php', 'javascript:alert(1)', '/next/../index.php') as $bad) {
	t(Url::next($bad) === '/next/', "sign-in never redirects to {$bad}");
}

/* Html */
t(Html::e('<a href="x">\'&') === '&lt;a href=&quot;x&quot;&gt;&#039;&amp;', 'text is escaped for content and attributes');
$el = Html::element('card', array('title' => '"><script>'));
t(preg_match('/^<div data-fs-el="card" data-fs-config="([^"<>]*)"><\/div>$/', $el, $mm) &&
    json_decode(htmlspecialchars_decode($mm[1], ENT_QUOTES), true) === array('title' => '"><script>'), 'element config cannot break out of its attribute');
t(strpos(Html::scriptJson(array('t' => '</script><b>')), '</') === false, 'JSON in a script block cannot close it');

/* Ui / Element */
$catalogue = Assets::elements();
t(count($catalogue) >= 50 && in_array('page-header', $catalogue, true), 'the element catalogue comes from the built manifest');
$ui = new Ui($catalogue);
t(throws(function () use ($ui) { $ui->fancyWidget(); }) && throws(function () use ($ui) { $ui->el('div'); }), 'elements outside the catalogue are refused');
$h = $ui->pageHeader('Peers')->breadcrumb(array(array('VPN'), array('WireGuard', '/vpn/wireguard')))->chip('ok', 'Running')
	->primary('add', 'Add peer', 'plus')->action('import', 'Import', 'file-import')->action('docs', 'Docs', 'book', '/vpn/wireguard');
t($h->name() === 'page-header' && $h->config() === array(
	'title' => 'Peers',
	'breadcrumb' => array(array('label' => 'VPN'), array('label' => 'WireGuard', 'href' => '/next/vpn/wireguard')),
	'chips' => array(array('state' => 'ok', 'label' => 'Running')),
	'primary' => array('id' => 'add', 'label' => 'Add peer', 'icon' => 'plus'),
	'actions' => array(array('id' => 'import', 'label' => 'Import', 'icon' => 'file-import'),
	    array('id' => 'docs', 'label' => 'Docs', 'icon' => 'book', 'href' => '/next/vpn/wireguard')),
), 'the page-header builder from its spec');
$card = $ui->card('System')->icon('server')->content($ui->kvList()->source('/status/system')->every(5)->field('uptime', 'Uptime', 'duration'));
t($card->config()['content'] === array('el' => 'kv-list', 'config' => array('source' => '/status/system', 'every' => 5,
    'fields' => array(array('name' => 'uptime', 'label' => 'Uptime', 'format' => 'duration')))), 'nested elements become {el, config}');
$grid = $ui->grid()->add($ui->card('A'), array('base' => 12, 'lg' => 6))->add($ui->card('B'));
t($grid->config()['items'] === array(array('el' => 'card', 'config' => array('title' => 'A'), 'span' => array('base' => 12, 'lg' => 6)),
    array('el' => 'card', 'config' => array('title' => 'B'))), 'grid items with spans');
$ui->add($ui->emptyState(array('icon' => 'inbox'))->id('x'));
t($ui->html() === '<div data-fs-el="empty-state" data-fs-config="{&quot;icon&quot;:&quot;inbox&quot;}" id="x"></div>', 'placed elements render as containers');

/* Nav */
$raw = json_decode(file_get_contents(FS_WEBUI_APP . '/nav.json'), true);
$entries = Nav::entries($raw);
t(count($entries) > 90, 'every navigation entry is listed');
foreach ($entries as $href => $e) {
	t(array_key_exists('priv', $e) && (($e['priv'] === null) || preg_match('/^page-[a-z0-9-]+$/', $e['priv'])), "{$href} names a privilege");
	t(preg_match('#^/[a-z0-9/-]*$#', $href) === 1, "{$href} is a route");
}
t($entries['/me']['priv'] === null && $entries['/']['priv'] === 'page-system-login-logout', 'profile is for everyone; the dashboard needs the dashboard privilege');

$all = new Nav($raw, function () { return true; });
$all->locate('/vpn/ipsec-keys');
t($all->areaId() === 'vpn' && strpos($all->menu(), 'aria-current="page"') !== false && $all->menuTitle() === 'IPsec', 'a page of a multi-page feature gets the card menu');
t($all->crumbs() === array(array('VPN'), array('IPsec', '/next/vpn/ipsec')), 'breadcrumb: area / feature');
t(strpos($all->areas(), 'href="/next/vpn/ipsec"') !== false && strpos(json_encode($all->model()), '"priv"') === false, 'menus link under the base and hide privileges');
$all->locate('/');
t($all->menu() === '' && $all->areaId() === 'dashboard', 'the dashboard is full width');

/* A user who may only see firewall rules and the IPsec keys page */
$some = new Nav($raw, function ($e) {
	return empty($e['package']) && in_array($e['priv'], array(null, 'page-firewall-rules', 'page-vpn-ipsec-listkeys'), true);
});
$m = $some->model();
t(array_column($m['areas'], 'id') === array('security', 'vpn'), 'areas without allowed pages disappear (the dashboard too)');
$vpn = $m['areas'][1]['groups'][0]['items'];
t(count($vpn) === 1 && $vpn[0]['href'] === '/next/vpn/ipsec-keys' && count($vpn[0]['pages']) === 1, 'a feature keeps only allowed pages and opens on the first');
t($some->first() === '/next/security/rules' && $all->first() === '/next/', 'the first page a user may open (start page without the dashboard)');
t($some->locate('/vpn/ipsec') === null && $some->locate('/vpn/ipsec-keys') !== null, 'hidden pages are not located');
$nopkg = new Nav($raw, function ($e) { return empty($e['package']); });
t(strpos(json_encode($nopkg->model()), 'wireguard') === false, 'package pages hide when the package is not installed');

/* Shell style */
$s = Shell::style(array('theme' => 'nope', 'mode' => 'dark', 'accent' => 'teal', 'density' => 'compact'));
t($s['theme'] === 'freesense' && $s['mode'] === 'dark' && $s['bsTheme'] === 'dark' && $s['accent'] === 'teal' && $s['density'] === 'compact',
    'preferences apply; an unknown theme falls back to freesense');
$s = Shell::style(array('accent' => '"><x', 'mode' => 'x'));
t($s['accent'] === 'coral' && $s['mode'] === 'auto' && $s['skin']['cards'] === 'outlined', 'invalid preferences fall back to the theme defaults');
t(preg_match('#^/ui/fs-ui\.css\?v=[0-9a-f]{12}$#', $s['css']) && preg_match('#^/themes/freesense/theme\.css\?v=[0-9a-f]{12}$#', $s['themeCss']), 'asset URLs are cache-busted');

/* Pages use elements only (RULES R1) */
foreach (glob(FS_WEBUI_APP . '/pages/*.php') as $file) {
	$src = file_get_contents($file);
	t(!preg_match('/<(div|span|p|a|script|style)\b|style=|echo |print\b|\?>/i', preg_replace('#/\*.*?\*/#s', '', $src)), basename($file) . ' has no markup');
}

if ($failed) {
	fwrite(STDERR, "{$failed} failed\n");
	exit(1);
}
echo "App tests passed.\n";
