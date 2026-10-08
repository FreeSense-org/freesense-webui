/* FS.fmt — formatting for rates, sizes, durations and times. */

const fixed = (v, big) => (v >= big ? Math.round(v) : v.toFixed(v >= 10 ? 1 : 2));

export const fmt = {
	bps(v) {
		if (v == null || Number.isNaN(v)) return '—';
		const u = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps'];
		let i = 0;
		while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
		return `${i === 0 ? Math.round(v) : fixed(v, 100)} ${u[i]}`;
	},
	bytes(v) {
		if (v == null || Number.isNaN(v)) return '—';
		const u = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
		let i = 0;
		while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
		return `${i === 0 ? Math.round(v) : (v >= 100 ? Math.round(v) : v.toFixed(1))} ${u[i]}`;
	},
	num: (v) => (v == null ? '—' : Number(v).toLocaleString()),
	compact(v) {
		if (v == null) return '—';
		if (Math.abs(v) < 1000) return String(v);
		const u = ['', 'k', 'M', 'G', 'T'];
		let i = 0;
		while (Math.abs(v) >= 1000 && i < u.length - 1) { v /= 1000; i++; }
		return (Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1)) + u[i];
	},
	pct: (v, d = 0) => (v == null ? '—' : `${Number(v).toFixed(d)}%`),
	duration(s) {
		if (s == null) return '—';
		const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
		return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m` : m ? `${m}m ${Math.floor(s % 60)}s` : `${Math.floor(s)}s`;
	},
	ago(iso) {
		const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
		if (s < 5) return 'just now';
		if (s < 60) return `${Math.floor(s)}s ago`;
		if (s < 3600) return `${Math.floor(s / 60)}m ago`;
		if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
		return `${Math.floor(s / 86400)}d ago`;
	},
	time: (iso) => new Date(iso).toLocaleTimeString([], { hour12: false }),
	datetime: (iso) => new Date(iso).toLocaleString([], { hour12: false })
};
