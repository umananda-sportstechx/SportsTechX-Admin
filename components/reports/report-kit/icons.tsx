import {
	DollarSign, Trophy, Users, Globe, TrendingUp, Activity, Zap, Building2, Rocket,
	Star, Heart, Flag, Handshake, Landmark, Footprints, Monitor, GitMerge, Lightbulb, Bot,
	BarChart3, type LucideIcon,
} from 'lucide-react';

/** Maps a section-content `icon` key to a lucide icon. Mirrors the admin map. */
const ICONS: Record<string, LucideIcon> = {
	funding: DollarSign, dollar: DollarSign, trophy: Trophy, users: Users, people: Users,
	globe: Globe, world: Globe, trend: TrendingUp, trending: TrendingUp, growth: TrendingUp, activity: Activity,
	zap: Zap, company: Building2, building: Building2, rocket: Rocket, startup: Rocket,
	star: Star, unicorn: Star, heart: Heart, flag: Flag, handshake: Handshake, deal: Handshake,
	investors: Users, play: Monitor,
	landmark: Landmark, gov: Landmark, footprints: Footprints, monitor: Monitor, broadcast: Monitor,
	merge: GitMerge, ma: GitMerge, idea: Lightbulb, lightbulb: Lightbulb, ai: Bot, bot: Bot,
	chart: BarChart3, bar: BarChart3,
};

export function SectionIcon({ name, size = 22, color }: { name: unknown; size?: number; color?: string }) {
	if (typeof name !== 'string') return null;
	const Icon = ICONS[name.toLowerCase()];
	if (!Icon) return null;
	return <Icon size={size} color={color} aria-hidden="true" />;
}
