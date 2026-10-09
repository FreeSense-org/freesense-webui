/*
 * core.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Gallery mock API (never shipped). A jQuery ajaxTransport answers
 * /api/v1/* in the browser with live-simulated firewall data, using the real
 * response envelopes:
 *   success  {data, meta}
 *   error    {error: {code, message, details: {fields}}}
 * so elements run unchanged against the product API later.
 *
 * Latency is randomised (60-260 ms) so loading states show. Add
 * ?fail=<path-fragment> to the page URL to make matching routes return 503.
 * Element groups can add routes in gallery/mock/routes-<group>.js with
 * FSMock.route(method, '/api/v1/...', handler) and FSMock.ok / FSMock.err.
 */
(function ($) {
	'use strict';

	var FAIL = new URLSearchParams(location.search).get('fail');
	var T0 = Date.now();
	var rnd = function (a, b) { return a + Math.random() * (b - a); };
	var pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
	var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

	/* ------------------------------------------------------------------ state */

	var IFACES = [
		{ id: 'wan',  descr: 'WAN',   if: 'igc0',   ipv4: '203.0.113.24/24', ipv6: '2001:db8:24::2/64', gw: 'WAN_DHCP', mac: '00:e0:67:2a:11:01', media: '2500baseT <full-duplex>', speed: 2500, base: 180e6, upRatio: 0.18 },
		{ id: 'lan',  descr: 'LAN',   if: 'igc1',   ipv4: '192.168.1.1/24',  ipv6: 'fd00:1::1/64',       gw: null,       mac: '00:e0:67:2a:11:02', media: '2500baseT <full-duplex>', speed: 2500, base: 150e6, upRatio: 4.2 },
		{ id: 'opt1', descr: 'GUEST', if: 'igc2',   ipv4: '10.20.0.1/24',    ipv6: null,                 gw: null,       mac: '00:e0:67:2a:11:03', media: '1000baseT <full-duplex>', speed: 1000, base: 22e6,  upRatio: 6.0 },
		{ id: 'opt2', descr: 'IOT',   if: 'igc3.30', ipv4: '10.30.0.1/24',   ipv6: null,                 gw: null,       mac: '00:e0:67:2a:11:04', media: '1000baseT <full-duplex>', speed: 1000, base: 3e6,   upRatio: 1.5 },
		{ id: 'opt3', descr: 'DMZ',   if: 'igc3.40', ipv4: '172.16.40.1/24', ipv6: null,                 gw: null,       mac: '00:e0:67:2a:11:04', media: '1000baseT <full-duplex>', speed: 1000, base: 9e6,   upRatio: 0.4 },
		{ id: 'wg0',  descr: 'WG_SITE', if: 'tun_wg0', ipv4: '10.99.0.1/24', ipv6: null,                 gw: null,       mac: null,                media: 'WireGuard', speed: null, base: 6e6, upRatio: 0.9 },
		{ id: 'opt4', descr: 'WAN2',  if: 'igc4',   ipv4: null,              ipv6: null,                 gw: 'WAN2_DHCP', mac: '00:e0:67:2a:11:05', media: 'no carrier', speed: 0, base: 0, upRatio: 1, down: true }
	];
	var traffic = {};
	IFACES.forEach(function (i) {
		traffic[i.id] = { inb: i.base, outb: i.base * i.upRatio / (1 + i.upRatio), bytesIn: rnd(2e11, 9e12), bytesOut: rnd(1e11, 3e12), errIn: 0, errOut: 0, colls: 0 };
	});

	function stepTraffic(id) {
		var i = IFACES.find(function (x) { return x.id === id; });
		var t = traffic[id];
		if (!i || i.down) { t.inb = 0; t.outb = 0; return t; }
		var cap = (i.speed || 1000) * 1e6 * 0.92;
		var burst = Math.random() < 0.06 ? rnd(1.5, 3.2) : 1;
		t.inb = clamp(t.inb * rnd(0.86, 1.14) * burst + (i.base - t.inb) * 0.12, i.base * 0.05, cap);
		var outTarget = i.base * (i.upRatio / (1 + i.upRatio)) * 1.2;
		t.outb = clamp(t.outb * rnd(0.85, 1.15) + (outTarget - t.outb) * 0.15, outTarget * 0.05, cap);
		t.bytesIn += t.inb / 8;
		t.bytesOut += t.outb / 8;
		if (Math.random() < 0.01) t.errIn++;
		return t;
	}
	setInterval(function () { IFACES.forEach(function (i) { stepTraffic(i.id); }); }, 1000);

	var sys = { cpu: 14, mem: 38, states: 18420, mbuf: 6, temps: [48, 51, 46, 44] };
	setInterval(function () {
		sys.cpu = clamp(sys.cpu + rnd(-6, 6) + (Math.random() < 0.04 ? 30 : 0), 2, 99);
		sys.cpu += (16 - sys.cpu) * 0.1;
		sys.mem = clamp(sys.mem + rnd(-0.4, 0.45), 30, 70);
		sys.states = Math.round(clamp(sys.states + rnd(-400, 420), 9000, 60000));
		sys.mbuf = clamp(sys.mbuf + rnd(-0.3, 0.3), 3, 12);
		sys.temps = sys.temps.map(function (t) { return clamp(t + rnd(-1, 1) + (sys.cpu - 15) * 0.02, 38, 82); });
	}, 1000);

	var GATEWAYS = [
		{ name: 'WAN_DHCP',  iface: 'wan',  address: '203.0.113.1',  monitor: '1.1.1.1', rtt: 8.4,  sd: 0.9, loss: 0, status: 'online', default: true },
		{ name: 'WAN_DHCP6', iface: 'wan',  address: 'fe80::1%igc0', monitor: '2606:4700:4700::1111', rtt: 9.1, sd: 1.2, loss: 0, status: 'online' },
		{ name: 'WG_SITE_GW', iface: 'wg0', address: '10.99.0.2',    monitor: '10.99.0.2', rtt: 21.8, sd: 2.4, loss: 0, status: 'online' },
		{ name: 'WAN2_DHCP', iface: 'opt4', address: '—',            monitor: '8.8.8.8', rtt: null, sd: null, loss: 100, status: 'down' }
	];
	setInterval(function () {
		GATEWAYS.forEach(function (g) {
			if (g.status === 'down') return;
			g.rtt = clamp(g.rtt + rnd(-1.2, 1.2) + (Math.random() < 0.03 ? 25 : 0), 4, 120);
			g.rtt += ((g.name === 'WG_SITE_GW' ? 22 : 8.5) - g.rtt) * 0.2;
			g.sd = clamp(g.sd + rnd(-0.3, 0.3), 0.2, 9);
			g.loss = Math.random() < 0.05 ? Math.round(rnd(1, 6)) : Math.max(0, g.loss - 1);
			g.status = g.loss > 5 || g.rtt > 100 ? 'warning' : 'online';
		});
	}, 1000);

	var SERVICES = [
		{ name: 'unbound',    descr: 'DNS Resolver',            running: true,  enabled: true },
		{ name: 'kea-dhcp4',  descr: 'Kea DHCP Server',         running: true,  enabled: true },
		{ name: 'ntpd',       descr: 'NTP clock sync',          running: true,  enabled: true },
		{ name: 'sshd',       descr: 'Secure Shell Daemon',     running: true,  enabled: true },
		{ name: 'syslogd',    descr: 'System Logger Daemon',    running: true,  enabled: true },
		{ name: 'dpinger',    descr: 'Gateway Monitoring',      running: true,  enabled: true },
		{ name: 'openvpn',    descr: 'OpenVPN server: RoadWarrior', running: true, enabled: true, mode: 'server', vpnid: 1 },
		{ name: 'wireguard',  descr: 'WireGuard',               running: true,  enabled: true },
		{ name: 'suricata',   descr: 'Suricata IDS/IPS (WAN)',  running: false, enabled: true },
		{ name: 'miniupnpd',  descr: 'UPnP IGD & PCP',          running: true,  enabled: true },
		{ name: 'crowdsec',   descr: 'CrowdSec agent',          running: true,  enabled: true },
		{ name: 'radvd',      descr: 'Router Advertisements',   running: true,  enabled: true }
	];

	var HOSTS = [
		['192.168.1.20', 'nas', '3c:52:82:aa:01:20'], ['192.168.1.31', 'admin-laptop', 'a4:83:e7:10:22:31'],
		['192.168.1.32', 'office-pc', '70:85:c2:44:12:32'], ['192.168.1.40', 'living-tv', '00:1a:11:9a:3c:40'],
		['192.168.1.55', 'pixel-9', 'd2:4f:8e:01:aa:55'], ['192.168.1.60', 'printer', '00:80:77:12:00:60'],
		['10.20.0.104', 'guest-iphone', '9a:21:0f:33:41:04'], ['10.20.0.117', '', '6e:12:aa:90:01:17'],
		['10.30.0.11', 'thermostat', '18:b4:30:00:11:11'], ['10.30.0.12', 'doorbell', 'ec:fa:bc:21:00:12'],
		['10.30.0.13', 'plug-kitchen', '24:62:ab:f1:00:13'], ['172.16.40.10', 'web01', '00:50:56:a1:40:10'],
		['172.16.40.11', 'mail01', '00:50:56:a1:40:11'], ['192.168.1.70', 'homeassistant', 'b8:27:eb:12:00:70']
	];

	var REMOTE = [
		['142.250.74.110', 'google.com'], ['104.16.132.229', 'cloudflare.com'], ['151.101.1.69', 'fastly'],
		['52.94.236.248', 'aws'], ['17.253.144.10', 'apple.com'], ['185.199.108.153', 'github.io'],
		['198.51.100.77', ''], ['45.95.147.12', ''], ['89.248.165.52', ''], ['162.142.125.33', 'censys'],
		['192.0.2.200', ''], ['13.107.42.14', 'microsoft']
	];

	/* Rule changes mark "rules" pending; the rules themselves live in routes-rules.js. */
	var pendingChanges = false;

	/* ------------------------------------------------------------------- logs */

	var logSeq = 50000;
	var FWLOG = [];
	var SYSLOG = [];
	var PROCS = ['kernel', 'php-fpm', 'unbound', 'kea-dhcp4', 'dpinger', 'openvpn', 'check_reload_status', 'sshd', 'ntpd', 'crowdsec', 'suricata'];
	var SYSMSG = {
		'kernel': ['igc0: link state changed to UP', 'arp: 192.168.1.55 moved from d2:4f:8e:01:aa:55 to d2:4f:8e:01:aa:56 on igc1', 'pflog0: promiscuous mode enabled'],
		'php-fpm': ['/index.php: Successful login for user \'admin\' from: 192.168.1.31 (Local Database)', '/firewall_rules.php: Rule order changed', '/rc.filter_configure_sync: Updating alias tables'],
		'unbound': ['[1203:0] info: generate keytag query _ta-4f66. NULL IN', '[1203:2] info: 127.0.0.1 example.org. A IN', '[1203:1] notice: init module 0: validator'],
		'kea-dhcp4': ['DHCP4_LEASE_ALLOC [hwtype=1 9a:21:0f:33:41:04], cid=[no info], tid=0x4a1: lease 10.20.0.104 has been allocated for 7200 seconds', 'DHCP4_PACKET_RECEIVED DHCPREQUEST from 18:b4:30:00:11:11'],
		'dpinger': ['WAN2_DHCP 8.8.8.8: sendto error: 65', 'WAN_DHCP 1.1.1.1: Clear latency 9ms stddev 1ms loss 0%'],
		'openvpn': ['roadwarrior1/198.51.100.77:51544 MULTI_sva: pool returned IPv4=10.8.0.6', 'TLS: Initial packet from [AF_INET]198.51.100.77:51544'],
		'check_reload_status': ['Reloading filter', 'Syncing firewall', 'Linkup starting igc0'],
		'sshd': ['Accepted publickey for admin from 192.168.1.31 port 52210 ssh2: ED25519', 'Disconnected from user admin 192.168.1.31 port 52210'],
		'ntpd': ['kernel reports TIME_ERROR: 0x41: Clock Unsynchronized', 'ntpd 4.2.8p18 synchronized to 162.159.200.1, stratum 3'],
		'crowdsec': ['Ip 45.95.147.12 performed \'crowdsecurity/ssh-bf\' (6 events over 2.1s)', 'Signal push: 3 signals pushed to Central API'],
		'suricata': ['[1:2010935:3] ET SCAN Suspicious inbound to MSSQL port 1433 [Classification: Potentially Bad Traffic] {TCP} 89.248.165.52:44211 -> 203.0.113.24:1433']
	};
	var PORTS = [22, 23, 53, 80, 123, 443, 445, 1433, 3389, 5060, 8080, 8443, 51820, 1194, 993, 25];

	function makeFwLog(at) {
		var inbound = Math.random() < 0.6;
		var iface = inbound ? pick(['wan', 'wan', 'wan', 'opt1', 'opt2']) : pick(['lan', 'opt1', 'opt2', 'opt3']);
		var ifo = IFACES.find(function (x) { return x.id === iface; });
		var src, dst;
		if (iface === 'wan') { src = pick(REMOTE)[0]; dst = '203.0.113.24'; }
		else { src = pick(HOSTS.filter(function (h) { return h[0].indexOf(ifo.ipv4.split('.').slice(0, 2).join('.')) === 0; }).concat([pick(HOSTS)]))[0]; dst = pick(REMOTE)[0]; }
		var proto = pick(['TCP:S', 'TCP:S', 'UDP', 'TCP:SA', 'ICMP', 'TCP:RA']);
		var action = iface === 'wan' ? pick(['block', 'block', 'block', 'pass', 'reject']) : pick(['pass', 'pass', 'block']);
		var rule = (window.FSMock && window.FSMock.ruleFor) ? window.FSMock.ruleFor(iface) : { tracker: '0100000101', descr: 'Default allow LAN to any rule' };
		return {
			id: ++logSeq, time: new Date(at).toISOString(), action: action, iface: iface, iface_descr: ifo.descr,
			dir: inbound ? 'in' : 'out', proto: proto, src: src, srcport: proto === 'ICMP' ? null : Math.floor(rnd(1024, 65535)),
			dst: dst, dstport: proto === 'ICMP' ? null : pick(PORTS), rule: rule.descr,
			tracker: rule.tracker, len: Math.floor(rnd(40, 1500))
		};
	}
	function makeSysLog(at) {
		var p = pick(PROCS);
		var sev = p === 'suricata' || p === 'crowdsec' ? 'warning' : (Math.random() < 0.08 ? 'error' : (Math.random() < 0.2 ? 'notice' : 'info'));
		return { id: ++logSeq, time: new Date(at).toISOString(), host: 'fw01', process: p, pid: Math.floor(rnd(100, 99999)), severity: sev, message: pick(SYSMSG[p]) };
	}
	for (var k = 400; k > 0; k--) { FWLOG.push(makeFwLog(T0 - k * 1500)); }
	for (var k2 = 300; k2 > 0; k2--) { SYSLOG.push(makeSysLog(T0 - k2 * 4000)); }
	setInterval(function () {
		var n = Math.floor(rnd(0, 4));
		for (var i = 0; i < n; i++) FWLOG.push(makeFwLog(Date.now()));
		if (Math.random() < 0.45) SYSLOG.push(makeSysLog(Date.now()));
		if (FWLOG.length > 3000) FWLOG.splice(0, 1000);
		if (SYSLOG.length > 3000) SYSLOG.splice(0, 1000);
	}, 1000);

	/* ----------------------------------------------------------------- notices */

	/* The API's shape (restapi_notice_list): {id, source, text, url, category, level: crit | warn | info, time}. */
	var nid = function (ms) { return String(Math.floor(ms / 1000)); };
	var NOTICES = [
		{ id: nid(T0 - 41 * 60000), source: 'gateways', category: 'Gateway WAN2_DHCP is down', text: 'Monitor 8.8.8.8 unreachable for 41 minutes. Gateway group FAILOVER is running degraded.', url: '', level: 'warn', time: new Date(T0 - 41 * 60000).toISOString() },
		{ id: nid(T0 - 5.3 * 3600000), source: 'suricata', category: 'Suricata (WAN) is not running', text: 'The service stopped after a rules update at 03:12. Restart it or check the Suricata log.', url: '', level: 'crit', time: new Date(T0 - 5.3 * 3600000).toISOString() },
		{ id: nid(T0 - 2 * 3600000), source: 'update', category: 'Update available', text: 'FreeSense 1.1.0.a.20261009.0100 is available. You are running 20261008.', url: '', level: 'info', time: new Date(T0 - 2 * 3600000).toISOString() },
		{ id: nid(T0 - 26 * 3600000), source: 'certificates', category: 'Certificate expires soon', text: 'webConfigurator default (fw01.home.arpa) expires in 24 days.', url: '', level: 'info', time: new Date(T0 - 26 * 3600000).toISOString() }
	];

	/* ------------------------------------------------------------- dashboards */

	/* The API's shape (status_metrics_vpn): {type, name, description, status, peer, since, handshake, rx, tx}. */
	var VPN = [
		{ type: 'wireguard', name: 'Office', description: 'Office', interface: 'tun_wg0', peer: '198.51.100.20:51820', status: 'up', since: null, handshake: 38, rx: 9.2e9, tx: 3.1e9 },
		{ type: 'wireguard', name: 'Phone', description: 'Phone', interface: 'tun_wg0', peer: '192.0.2.88:40112', status: 'up', since: null, handshake: 112, rx: 1.1e8, tx: 9.9e8 },
		{ type: 'openvpn', name: 'RoadWarrior UDP4:1194', description: 'RoadWarrior UDP4:1194', peer: '1 client', status: 'up', since: 4200, handshake: null, rx: 2.2e8, tx: 1.3e9, vpnid: 1 },
		{ type: 'ipsec', name: 'con1', description: 'Datacenter', peer: '192.0.2.10', status: 'up', since: 86400 * 3 + 3600, handshake: null, rx: 5.1e10, tx: 2.2e10 },
		{ type: 'ipsec', name: 'con2', description: 'Branch Aarhus', peer: '198.51.100.140', status: 'connecting', since: null, handshake: null, rx: 0, tx: 0 }
	];

	/* /v1/status/system as the API returns it (status_metrics_system). */
	function sysPayload() {
		var up = 86400 * 12 + 3600 * 5 + 1540 + Math.floor((Date.now() - T0) / 1000);
		var MiB = 1048576;
		return {
			cpu: { model: 'Intel(R) Celeron(R) J6412 @ 2.00GHz', count: 4, usage: Math.round(sys.cpu * 10) / 10,
				load: [+(sys.cpu / 28).toFixed(2), +(sys.cpu / 31).toFixed(2), 0.41], freq_mhz: 2000, freq_max_mhz: 2600 },
			memory: { used_bytes: Math.round(sys.mem / 100 * 8192) * MiB, total_bytes: 8192 * MiB },
			swap: { used_bytes: 0, total_bytes: 4096 * MiB },
			mbuf: { used: Math.round(sys.mbuf * 1000), max: 300000 },
			states: { current: sys.states, max: 800000 },
			temperatures: sys.temps.map(function (c, i) { return { name: 'CPU ' + i, celsius: Math.round(c * 10) / 10 }; }),
			disks: [{ device: 'zroot/ROOT/default', mount: '/', type: 'zfs', used_bytes: 4.1e9, total_bytes: 1.08e11 },
				{ device: 'zroot/var/log', mount: '/var/log', type: 'zfs', used_bytes: 1.3e9, total_bytes: 1.08e11 },
				{ device: 'tmpfs', mount: '/tmp', type: 'tmpfs', used_bytes: 3.1e7, total_bytes: 5.12e8 }],
			uptime_seconds: up,
			time: Math.floor(Date.now() / 1000)
		};
	}
	/* /v1/system/info as the API returns it. */
	function infoPayload() {
		return { hostname: 'fw01', domain: 'home.arpa', product: 'FreeSense', version: '1.1.0-DEVELOPMENT', freebsd: '16.0-CURRENT', platform: 'amd64',
			cpu: 'Intel(R) Celeron(R) J6412 @ 2.00GHz', cpu_count: 4, memory_bytes: 8192 * 1048576,
			uptime_seconds: sysPayload().uptime_seconds, config_revision: { time: Math.floor((T0 - 3 * 3600000) / 1000), description: 'admin@192.168.1.31 (Local Database): Edited a firewall alias.' } };
	}

	/* /v1/status/interfaces as the API returns it (no rates; those are /v1/status/traffic). */
	var maskOf = function (bits) { var m = []; for (var k = 0; k < 4; k++) { var n = Math.min(8, Math.max(0, bits - k * 8)); m.push(256 - Math.pow(2, 8 - n)); } return m.join('.'); };
	function ifPayload(i) {
		var t = traffic[i.id];
		var v4 = i.ipv4 ? i.ipv4.split('/') : [null, null];
		var v6 = i.ipv6 ? i.ipv6.split('/') : [null, null];
		return {
			name: i.id, description: i.descr, hwif: i.if.split('.')[0], enable: true, if: i.if, status: i.down ? 'no carrier' : 'up',
			macaddr: i.mac, mtu: i.id === 'wg0' ? 1420 : 1500, ipaddr: v4[0], subnet: v4[1] ? maskOf(+v4[1]) : null,
			ipaddrv6: v6[0], subnetv6: v6[1] || null, inerrs: t.errIn, outerrs: t.errOut, collisions: t.colls,
			inbytes: Math.round(t.bytesIn), outbytes: Math.round(t.bytesOut), inpkts: Math.round(t.bytesIn / 900), outpkts: Math.round(t.bytesOut / 700),
			media: i.media, gateway: i.gw ? (GATEWAYS.find(function (g) { return g.name === i.gw; }) || {}).address || null : null
		};
	}

	function history(iface, points, stepSec) {
		var i = IFACES.find(function (x) { return x.id === iface; }) || IFACES[0];
		var now = Date.now(), inb = [], outb = [], ts = [];
		var a = i.base, b = i.base * i.upRatio / (1 + i.upRatio);
		for (var p = points; p > 0; p--) {
			var tod = ((now - p * stepSec * 1000) / 3600000) % 24;
			var diurnal = 0.55 + 0.45 * Math.sin((tod - 8) / 24 * Math.PI * 2);
			a = clamp(a * rnd(0.88, 1.12) + (i.base * diurnal - a) * 0.2, 0, 1e10);
			b = clamp(b * rnd(0.88, 1.12) + (i.base * diurnal * 0.3 - b) * 0.2, 0, 1e10);
			ts.push(Math.floor((now - p * stepSec * 1000) / 1000)); inb.push(i.down ? 0 : Math.round(a)); outb.push(i.down ? 0 : Math.round(b));
		}
		return { iface: iface, step: stepSec, t: ts, in_bps: inb, out_bps: outb };
	}

	function topTalkers() {
		var list = HOSTS.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 8).map(function (h) {
			var rate = Math.pow(Math.random(), 2.4) * 80e6 + 2e5;
			return { ip: h[0], host: h[1], in_bps: Math.round(rate), out_bps: Math.round(rate * rnd(0.05, 0.4)) };
		});
		return list.sort(function (a, b) { return (b.in_bps + b.out_bps) - (a.in_bps + a.out_bps); });
	}

	/* /v1/status/dhcp-leases as the API returns it (system_get_dhcpleases + reachable/static). */
	function apiLeases() {
		return { leases: leases().map(function (l) {
			var ifo = IFACES.find(function (x) { return x.descr === l.iface; }) || IFACES[1];
			return { ip: l.ip, type: l.type, mac: l.mac, hostname: l.hostname, descr: l.vendor, if: ifo.id, act: 'active',
				online: l.online ? 'active/online' : 'idle/offline', starts: '', ends: l.expires, reachable: l.online, static: l.type === 'static' };
		}), failover: [] };
	}
	function leases() {
		return HOSTS.map(function (h, n) {
			var exp = T0 + (n * 1300 + 600) * 1000;
			return { ip: h[0], mac: h[2], hostname: h[1], iface: h[0].indexOf('192.168.1.') === 0 ? 'LAN' : h[0].indexOf('10.20.') === 0 ? 'GUEST' : h[0].indexOf('10.30.') === 0 ? 'IOT' : 'DMZ',
				type: n % 4 === 0 ? 'static' : 'dynamic', online: n % 5 !== 3, expires: new Date(exp).toISOString(), vendor: pick(['Apple', 'Synology', 'Raspberry Pi', 'Espressif', 'Intel', 'Google', 'VMware', 'Brother']) };
		});
	}

	/* ---------------------------------------------------------------- routing */

	var ROUTES = [];
	function route(method, pattern, handler) {
		var keys = [];
		var re = new RegExp('^' + pattern.replace(/\{(\w+)\}/g, function (_, k) { keys.push(k); return '([^/]+)'; }) + '$');
		ROUTES.push({ method: method, re: re, keys: keys, handler: handler });
	}
	function ok(data, meta) { return { status: 200, body: { data: data, meta: $.extend({ time: new Date().toISOString() }, meta || {}) } }; }
	/* As the API: a 422 lists every message in details.messages and the ones tied to a field in details.fields. */
	function err(status, message, fields, others) {
		var code = { 400: 'bad_request', 401: 'unauthenticated', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 422: 'validation_failed', 503: 'unavailable' }[status] || 'error';
		var details;
		if (fields || others) {
			details = { messages: Object.keys(fields || {}).map(function (k) { return String(fields[k]); }).concat(others || []) };
			if (fields && Object.keys(fields).length) details.fields = fields;
		}
		return { status: status, body: { error: { code: code, message: message, details: details } } };
	}

	route('GET', '/api/v1/status/system', function () { return ok(sysPayload()); });
	route('GET', '/api/v1/system/info', function () { return ok(infoPayload()); });
	route('GET', '/api/v1/status/interfaces', function () { return ok(IFACES.map(ifPayload)); });
	route('GET', '/api/v1/status/traffic', function (p, q) {
		var ids = (q.get('if') || IFACES.map(function (i) { return i.id; }).join(',')).split(',');
		var out = {};
		ids.forEach(function (id) {
			var tr = traffic[id], ifo = IFACES.find(function (x) { return x.id === id; });
			if (tr) out[id] = { description: ifo.descr, in_bps: Math.round(tr.inb), out_bps: Math.round(tr.outb), in_pps: Math.round(tr.inb / 8 / 900),
				out_pps: Math.round(tr.outb / 8 / 700), in_bytes: Math.round(tr.bytesIn), out_bytes: Math.round(tr.bytesOut) };
		});
		return ok({ t: Math.floor(Date.now() / 1000), interfaces: out });
	});
	route('GET', '/api/v1/status/traffic/history', function (p, q) {
		var range = q.get('range') || '1h';
		var cfg = { '10m': [120, 5], '1h': [180, 20], '24h': [288, 300], '7d': [336, 1800] }[range] || [180, 20];
		var h = history(q.get('if') || 'wan', cfg[0], cfg[1]);
		return ok({ interface: h.iface, range: range, step: h.step, t: h.t, in_bps: h.in_bps, out_bps: h.out_bps });
	});
	/* /v1/status/gateways as the API returns it: dpinger's strings plus delay_ms, stddev_ms, loss_pct, interface, default (level 8). */
	route('GET', '/api/v1/status/gateways', function () {
		return ok(GATEWAYS.map(function (g) {
			var r1 = function (v) { return v === null ? null : Math.round(v * 1000) / 1000; };
			var down = g.status === 'down';
			return { monitorip: g.monitor, srcip: (IFACES.find(function (x) { return x.id === g.iface; }) || {}).ipv4 ? IFACES.find(function (x) { return x.id === g.iface; }).ipv4.split('/')[0] : '',
				name: g.name, delay: down ? '0ms' : r1(g.rtt) + 'ms', stddev: down ? '0ms' : r1(g.sd) + 'ms', loss: g.loss + '.0%',
				status: g.status === 'warning' ? 'loss' : g.status, substatus: g.status === 'warning' ? 'highloss' : 'none',
				delay_ms: down ? null : r1(g.rtt), stddev_ms: down ? null : r1(g.sd), loss_pct: g.loss,
				interface: g.iface, description: 'Interface ' + g.name + ' Gateway', ipprotocol: /6$/.test(g.name) ? 'inet6' : 'inet', default: !!g.default };
		}));
	});
	route('GET', '/api/v1/status/services', function () {
		return ok(SERVICES.map(function (s) {
			var o = { name: s.name, description: s.descr, running: s.running };
			if (s.mode) { o.mode = s.mode; o.vpnid = s.vpnid; }
			return o;
		}));
	});
	route('POST', '/api/v1/services/{name}/{action}', function (p, q, b) {
		var s = SERVICES.find(function (x) { return x.name === p.name; });
		if (!s) return err(404, 'No such service');
		if (!b || b.confirm !== true) return err(400, 'Add {"confirm": true} to the request body.');
		if (p.action === 'stop') s.running = false; else s.running = true;
		return ok(s, { message: s.descr + ' ' + (p.action === 'stop' ? 'stopped' : p.action === 'start' ? 'started' : 'restarted') });
	});
	route('GET', '/api/v1/status/dhcp-leases', function () { return ok(apiLeases()); });
	/* As the API: hosts on the interface's subnet from a one-second sample; 404 for an unknown interface. */
	route('GET', '/api/v1/status/top-talkers', function (p, q) {
		var ifo = IFACES.find(function (x) { return x.id === (q.get('interface') || 'lan'); });
		if (!ifo) return err(404, 'No such interface.');
		return ok(topTalkers(), { interface: ifo.id, description: ifo.descr, window: '1s', age: Math.floor(rnd(0, 4)) });
	});
	route('GET', '/api/v1/status/vpn', function () {
		VPN.forEach(function (v) { if (v.status === 'up') { v.rx += rnd(1e4, 3e6); v.tx += rnd(1e4, 1e6); v.handshake = v.type === 'wireguard' ? (v.handshake + 2) % 130 : v.handshake; } });
		return ok(VPN);
	});
	route('GET', '/api/v1/status/states', function () {
		/* The API's shape (status_metrics_states); by_proto is not part of it. */
		return ok({ current: sys.states, searches: 3755280 + Math.floor((Date.now() - T0) / 50), inserts: 29910, removals: 29877,
			search_rate: Math.round(rnd(9000, 21000)), insert_rate: Math.round(rnd(80, 420)), removal_rate: Math.round(rnd(80, 420)), max: 800000 });
	});
	route('GET', '/api/v1/notices', function () { return ok(NOTICES); });
	route('DELETE', '/api/v1/notices/{id}', function (p) {
		var i = NOTICES.findIndex(function (n) { return String(n.id) === p.id; });
		if (i >= 0) NOTICES.splice(i, 1);
		return ok(null);
	});

	/* Areas with unapplied changes besides the rules (aliases, nat, virtual_ips), set by the other mock files. */
	var pendingAreas = {};
	function pendingList() { return (pendingChanges ? ['rules'] : []).concat(Object.keys(pendingAreas)); }
	route('GET', '/api/v1/firewall/pending', function () { return ok({ pending: pendingList() }); });
	route('POST', '/api/v1/firewall/apply', function () { pendingChanges = false; pendingAreas = {}; return ok({ applied: true, pending: [] }); });
	route('GET', '/api/v1/logs/firewall', function (p, q) { return logQuery(FWLOG, q, function (e, s) {
		return (e.src + ' ' + e.dst + ' ' + e.rule + ' ' + e.proto + ' ' + e.iface_descr + ' ' + (e.dstport || '')).toLowerCase().indexOf(s) >= 0;
	}, function (e, q) {
		var a = q.get('action'), i = q.get('iface');
		return (!a || a.split(',').indexOf(e.action) >= 0) && (!i || e.iface === i);
	}); });
	route('GET', '/api/v1/logs/system', function (p, q) { return logQuery(SYSLOG, q, function (e, s) {
		return (e.process + ' ' + e.message).toLowerCase().indexOf(s) >= 0;
	}, function (e, q) {
		var sev = q.get('severity'), pr = q.get('process');
		return (!sev || sev.split(',').indexOf(e.severity) >= 0) && (!pr || e.process === pr);
	}); });

	/*
	 * Log cursor protocol (same shape for every log):
	 *   ?after=<id>   entries newer than id (live tail), oldest first
	 *   ?before=<id>  older page for infinite scroll, newest first
	 *   ?limit=n  ?q=text  plus per-log filters
	 * meta.last_id is the cursor for the next ?after= call.
	 */
	function logQuery(src, q, textMatch, filterMatch) {
		var limit = Math.min(+q.get('limit') || 100, 500);
		var after = +q.get('after') || 0, before = +q.get('before') || 0;
		var s = (q.get('q') || '').toLowerCase();
		var rows = src.filter(function (e) { return (!s || textMatch(e, s)) && filterMatch(e, q); });
		var out, older = rows;
		if (after) out = rows.filter(function (e) { return e.id > after; }).slice(-limit);
		else {
			if (before) older = rows.filter(function (e) { return e.id < before; });
			out = older.slice(-limit).reverse();
		}
		var lastId = src.length ? src[src.length - 1].id : 0;
		return ok(out, { last_id: lastId, total: rows.length, has_more: !after && older.length > limit });
	}

	/* Per-user dashboard layout. The demo keeps it in localStorage per style. */
	route('GET', '/api/v1/dashboard/layout', function (p, q) {
		var saved = null;
		try { saved = JSON.parse(localStorage.getItem('fs-demo-layout:' + (q.get('style') || 'default'))); } catch (e) { /* storage unavailable */ }
		return ok(saved);
	});
	route('PUT', '/api/v1/dashboard/layout', function (p, q, body) {
		try { localStorage.setItem('fs-demo-layout:' + (body.style || 'default'), JSON.stringify(body.widgets)); } catch (e) { /* storage unavailable */ }
		return ok(null, { message: 'Dashboard saved' });
	});
	route('DELETE', '/api/v1/dashboard/layout', function (p, q) {
		try { localStorage.removeItem('fs-demo-layout:' + (q.get('style') || 'default')); } catch (e) { /* storage unavailable */ }
		return ok(null);
	});

	/* ------------------------------------------------------------ dispatch */

	function dispatch(method, path, query, body) {
		if (FAIL && path.indexOf(FAIL) >= 0) return err(503, 'Simulated failure (?fail=' + FAIL + ')');
		for (var i = 0; i < ROUTES.length; i++) {
			var r = ROUTES[i];
			if (r.method !== method) continue;
			var m = r.re.exec(path);
			if (!m) continue;
			var params = {};
			r.keys.forEach(function (k, n) { params[k] = decodeURIComponent(m[n + 1]); });
			return r.handler(params, query, body);
		}
		return err(404, 'No mock route for ' + method + ' ' + path);
	}

	/* POST /api/v1/batch {requests: [{id, method, path}]} -> [{id, status, body}] */
	route('POST', '/api/v1/batch', function (p, q, body) {
		var delay = 0;
		var out = ((body && body.requests) || []).map(function (r) {
			var u = new URL(r.path, location.origin);
			var path = u.pathname.slice(u.pathname.indexOf('/api/v1/'));
			var res = dispatch((r.method || 'GET').toUpperCase(), path, u.searchParams, null);
			delay = Math.max(delay, res.delay || 0);
			return { id: r.id, status: res.status, body: res.body };
		});
		return Object.assign(ok(out), delay ? { delay: delay } : {});
	});

	/* --------------------------------------------------------------- transport */

	$.ajaxTransport('+*', function (opts) {
		var url = new URL(opts.url, location.href);
		if (url.pathname.indexOf('/api/v1/') < 0) return undefined;
		var path = url.pathname.slice(url.pathname.indexOf('/api/v1/'));
		var timer;
		return {
			send: function (headers, done) {
				var method = (opts.type || 'GET').toUpperCase();
				var body = null;
				if (opts.data && method !== 'GET') { try { body = typeof opts.data === 'string' ? JSON.parse(opts.data) : opts.data; } catch (e) { body = null; } }
				/* A route may return {delay: ms} to answer later (slow sources). */
				var res = dispatch(method, path, url.searchParams, body);
				timer = setTimeout(function () {
					var text = JSON.stringify(res.body);
					done(res.status, res.status < 400 ? 'success' : 'error', { text: text }, 'Content-Type: application/json');
				}, res.delay || rnd(60, 260));
			},
			abort: function () { clearTimeout(timer); }
		};
	});

	window.FSMock = {
		routes: ROUTES, interfaces: IFACES, ok: ok, err: err, dispatch: dispatch,
		markPending: function (area) { pendingAreas[area] = true; }, clearPending: function (area) { delete pendingAreas[area]; }, markRulesPending: function () { pendingChanges = true; }, pending: pendingList,
		route: function (method, pattern, handler) { route(method, pattern, handler); ROUTES.unshift(ROUTES.pop()); }
	};
})(jQuery);
