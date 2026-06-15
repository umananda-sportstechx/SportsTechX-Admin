import { AdminShell } from '@/components/admin-shell';
import { ConfirmProvider } from '@/components/confirm';

export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
	return <AdminShell><ConfirmProvider>{children}</ConfirmProvider></AdminShell>;
}
