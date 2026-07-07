import type { Metadata } from 'next';
import { IBM_Plex_Sans, JetBrains_Mono } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

// Admin font stack — IBM Plex Sans (display + body) to match the STX-WebApp
// admin's clean SaaS look; JetBrains Mono kept for numeric/tabular cells.
const sans = IBM_Plex_Sans({
	variable: '--font-ibm-plex-sans',
	subsets: ['latin'],
	weight: ['300', '400', '500', '600', '700'],
});

const mono = JetBrains_Mono({
	variable: '--font-jetbrains-mono',
	subsets: ['latin'],
	weight: ['400', '500', '700'],
});

export const metadata: Metadata = {
	title: 'SportsTechX Admin',
	description: 'Internal administration tools for the SportsTechX platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html
			lang="en"
			data-density="comfortable"
			suppressHydrationWarning
			className={`${sans.variable} ${mono.variable} h-full antialiased`}
		>
			<body className="min-h-full flex flex-col">
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
