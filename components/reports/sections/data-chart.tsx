'use client';

import type { VisibleSection } from '../report-kit/types';
import { useLiveSectionData } from '../report-kit/live-data';
import { YearBarsLineChart, BarsChart, LineChartRk, DonutChart, BarList, RegionCards, type Point } from '../report-kit/charts';

/** data_chart — live aggregate as a bespoke chart. Content: { chart_type, display?, metric, filters }. */
export function DataChartSection({ section }: { section: VisibleSection }) {
	const chartType = (section.content.chart_type as string) ?? 'bar';
	const metric = (section.content.metric as string) ?? 'funding_by_year';
	const display = (section.content.display as string) ?? 'chart';
	const { ref, data, isLoading } = useLiveSectionData<Array<Record<string, unknown>>>(section.id);

	const isYear = metric === 'funding_by_year' || metric === 'ma_by_year';
	const labelKey = isYear ? 'year' : metric === 'funding_by_country' ? 'country' : metric === 'funding_by_region' ? 'region' : metric === 'funding_by_sector' ? 'sector' : 'name';

	const rows = data ?? [];
	const latestYear = isYear ? Math.max(...rows.map((r) => Number(r.year ?? 0)), 0) : null;
	const points: Point[] = rows.map((r) => ({
		label: String(r[labelKey] ?? '—'),
		value: Number(r.total ?? 0),
		deals: r.deals != null ? Number(r.deals) : undefined,
		highlight: isYear && Number(r.year) === latestYear,
	}));

	return (
		<div ref={ref}>
			{isLoading && <div style={{ padding: 14, color: 'var(--rk-fg-muted)' }}>Loading…</div>}
			{!isLoading && points.length > 0 && (
				display === 'region_cards' ? <RegionCards data={points} />
					: display === 'bar_list' ? <BarList data={points} />
						: isYear ? <YearBarsLineChart data={points} valueLabel={metric === 'ma_by_year' ? 'M&A value' : 'Funding'} />
							: chartType === 'pie' ? <DonutChart data={points} />
								: chartType === 'line' ? <LineChartRk data={points} />
									: <BarsChart data={points} />
			)}
			{!isLoading && points.length === 0 && <div style={{ padding: 14, color: 'var(--rk-fg-muted)' }}>No data.</div>}
		</div>
	);
}
