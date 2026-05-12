import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

// SportsTechX font stack — matches the client app exactly so the admin shell
// inherits the same display / body / mono families via CSS variables defined
// in design-system.css.
const display = Space_Grotesk({
	variable: '--font-space-grotesk',
	subsets: ['latin'],
	weight: ['400', '500', '600', '700'],
});

const body = Inter({
	variable: '--font-inter',
	subsets: ['latin'],
	weight: ['400', '500', '600', '700'],
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
			className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
		>
			<body className="min-h-full flex flex-col">
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
