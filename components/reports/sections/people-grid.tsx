'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { RichText } from '../report-kit/tiptap';

/**
 * people_grid — innovator / people avatars with region-coloured rings, optional
 * click-through detail panel or external link. Content:
 * { intro?, regions?[]{key,label,color}, people[]{name,org?,region?,photo_url?,detail?,link?} }.
 */
type PersonEntry = { name: unknown; org?: unknown; region?: string; photo_url?: string; detail?: unknown; link?: string };
type RegionDef = { key: string; label: unknown; color?: string };

const initialsOf = (name: unknown) =>
	typeof name === 'string' ? name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase() : '';

function Avatar({ person, size, colorFor }: { person: PersonEntry; size: number; colorFor: (r?: string) => string }) {
	const ring = colorFor(person.region);
	return (
		<div style={{ width: size, height: size, borderRadius: '50%', border: `3px solid ${ring}`, overflow: 'hidden', display: 'grid', placeItems: 'center', background: 'var(--rk-bg-card)', boxShadow: `0 0 18px ${ring}44` }}>
			{person.photo_url
				/* eslint-disable-next-line @next/next/no-img-element */
				? <img src={person.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', filter: 'grayscale(15%)' }} />
				: <span style={{ fontFamily: 'var(--rk-font-display)', fontSize: size * 0.34, color: 'var(--rk-fg-muted)' }}>{initialsOf(person.name)}</span>}
		</div>
	);
}

export function PeopleGridSection({ content }: { content: Record<string, unknown> }) {
	const intro = content.intro;
	const regions = (content.regions as RegionDef[]) ?? [];
	const people = (content.people as PersonEntry[]) ?? [];
	const [selected, setSelected] = useState<PersonEntry | null>(null);
	const colorFor = (region?: string) => regions.find((r) => r.key === region)?.color ?? 'var(--rk-accent)';
	return (
		<div>
			{intro != null && <p style={{ fontSize: 15, color: 'var(--rk-fg-sec)', margin: '0 0 16px', lineHeight: 1.6 }}><RichText value={intro} inline /></p>}
			{regions.length > 0 && (
				<div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
					{regions.map((r) => (
						<span key={r.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'var(--rk-font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rk-fg-muted)' }}>
							<span style={{ width: 10, height: 10, borderRadius: '50%', background: r.color ?? 'var(--rk-accent)' }} />
							<RichText value={r.label} inline />
						</span>
					))}
				</div>
			)}
			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 20 }}>
				{people.map((p, i) => {
					const clickable = !!(p.detail || p.link);
					return (
						<div key={i} onClick={() => { if (p.detail) setSelected(p); else if (p.link) window.open(p.link, '_blank', 'noopener'); }} style={{ textAlign: 'center', cursor: clickable ? 'pointer' : 'default' }}>
							<div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}><Avatar person={p} size={92} colorFor={colorFor} /></div>
							<div style={{ fontFamily: 'var(--rk-font-display)', fontSize: 17, letterSpacing: '0.01em', lineHeight: 1.05, color: 'var(--rk-fg)' }}><RichText value={p.name} inline /></div>
							{p.org != null && <div style={{ fontFamily: 'var(--rk-font-mono)', fontSize: 10, color: colorFor(p.region), textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4, lineHeight: 1.3 }}><RichText value={p.org} inline /></div>}
						</div>
					);
				})}
			</div>
			{selected && (
				<div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
					<div onClick={(e) => e.stopPropagation()} style={{ width: 'min(420px, 100%)', height: '100%', background: 'var(--rk-bg)', borderLeft: '1px solid var(--rk-border)', padding: 28, overflowY: 'auto' }}>
						<button type="button" onClick={() => setSelected(null)} style={{ float: 'right', border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--rk-fg-muted)', fontSize: 24, lineHeight: 1 }}>×</button>
						<div style={{ marginBottom: 12 }}><Avatar person={selected} size={80} colorFor={colorFor} /></div>
						<h3 style={{ margin: '0 0 2px', fontFamily: 'var(--rk-font-display)', fontSize: 24, color: 'var(--rk-title)' }}><RichText value={selected.name} inline /></h3>
						{selected.org != null && <div style={{ fontSize: 13, color: colorFor(selected.region), marginBottom: 12 }}><RichText value={selected.org} inline /></div>}
						{selected.detail != null && <div style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--rk-fg-sec)' }}><RichText value={selected.detail} /></div>}
						{selected.link && <a href={selected.link} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 16, color: 'var(--rk-accent)', fontSize: 13 }}>Profile <ExternalLink size={12} /></a>}
					</div>
				</div>
			)}
		</div>
	);
}
