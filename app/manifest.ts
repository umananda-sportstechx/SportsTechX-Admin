import type { MetadataRoute } from 'next';

/** Lets the admin be pinned / installed with its own name and the STX mark. */
export default function manifest(): MetadataRoute.Manifest {
	return {
		name: 'SportsTechX Admin',
		short_name: 'STX Admin',
		description: 'Internal administration tools for the SportsTechX platform',
		start_url: '/',
		display: 'standalone',
		background_color: '#0c0f1a',
		theme_color: '#0c0f1a',
		icons: [
			{ src: '/icon.png', sizes: '256x256', type: 'image/png' },
			{ src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
		],
	};
}
