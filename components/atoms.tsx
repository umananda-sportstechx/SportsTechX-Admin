'use client';

import React from 'react';

/**
 * Tiny shared atoms for admin pages. Mirrors the small subset of components
 * the (app) client uses, scoped down to what admin pages actually need:
 *
 *   - <PageHeader/>   page title + kicker + optional subtitle/action
 *   - <Empty/>        centered placeholder for empty/loading states
 *   - <Tag/>          uppercase pill (status badge etc.)
 *   - <Chip/>         filter chip with active state
 *   - <Section/>      card with section head + body
 *
 * Anything more complex (Logo, Sparkline, WorldMap, …) belongs in the main
 * client app, not here — admin pages are deliberately spartan.
 */

interface PageHeaderProps {
	kicker?: string;
	title: string;
	subtitle?: string;
	action?: React.ReactNode;
}

export function PageHeader({ kicker, title, subtitle, action }: PageHeaderProps) {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'flex-end',
				justifyContent: 'space-between',
				marginBottom: 'var(--space-5)',
				flexWrap: 'wrap',
				gap: 16,
			}}
		>
			<div>
				{kicker && (
					<div
						style={{
							fontFamily: 'var(--font-mono)',
							fontSize: 11,
							color: 'var(--fg-muted)',
							textTransform: 'uppercase',
							letterSpacing: '0.1em',
							marginBottom: 6,
						}}
					>
						{kicker}
					</div>
				)}
				<h1
					style={{
						fontFamily: 'var(--font-display)',
						fontSize: 38,
						fontWeight: 800,
						letterSpacing: '-0.02em',
						lineHeight: 1,
						margin: '0 0 6px',
					}}
				>
					{title}
				</h1>
				{subtitle && (
					<p style={{ fontSize: 14, color: 'var(--fg-2)', maxWidth: 640, margin: 0 }}>
						{subtitle}
					</p>
				)}
			</div>
			{action}
		</div>
	);
}

export function Empty({ msg }: { msg: string }) {
	return (
		<div
			style={{
				padding: 'var(--space-5)',
				textAlign: 'center',
				color: 'var(--fg-muted)',
				fontSize: 13,
				fontFamily: 'var(--font-mono)',
				textTransform: 'uppercase',
				letterSpacing: '0.08em',
			}}
		>
			{msg}
		</div>
	);
}

type TagVariant = '' | 'pos' | 'neg' | 'warn' | 'pill';

export function Tag({ children, variant = '' }: { children: React.ReactNode; variant?: TagVariant }) {
	return <span className={`tag ${variant}`}>{children}</span>;
}

interface ChipProps {
	active?: boolean;
	count?: number | string;
	onClick?: () => void;
	children: React.ReactNode;
}

export function Chip({ active, count, onClick, children }: ChipProps) {
	return (
		<button type="button" className={`chip ${active ? 'on' : ''}`} onClick={onClick}>
			{children}
			{count != null && <span className="ct">{count}</span>}
		</button>
	);
}

interface SectionProps {
	title: string;
	meta?: string;
	action?: React.ReactNode;
	children: React.ReactNode;
	padded?: boolean;
}

export function Section({ title, meta, action, children, padded = true }: SectionProps) {
	return (
		<div className="card">
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					padding: '12px var(--space-4)',
					borderBottom: '1px solid var(--border)',
					gap: 12,
				}}
			>
				<div style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0 }}>
					<div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
					{meta && (
						<div
							style={{
								fontFamily: 'var(--font-mono)',
								fontSize: 11,
								color: 'var(--fg-muted)',
								textTransform: 'uppercase',
								letterSpacing: '0.08em',
							}}
						>
							{meta}
						</div>
					)}
				</div>
				{action}
			</div>
			<div style={padded ? { padding: 'var(--space-4)' } : undefined}>{children}</div>
		</div>
	);
}
