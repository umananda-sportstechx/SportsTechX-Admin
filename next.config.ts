import type { NextConfig } from 'next';

/**
 * Backend URL for the NestJS API. `.env.local` overrides this — we default
 * to `http://localhost:5000` to match the server's local dev port. (Admin's
 * own dev port is 3001; do not confuse the two.)
 *
 * The rewrite below makes admin code talk to relative `/api/*` URLs and
 * lets Next.js proxy them to the backend in dev. Production deployments
 * either keep this rewrite (if admin is co-hosted) or override `BACKEND_URL`
 * to point at the deployed API.
 */
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:5000';

const nextConfig: NextConfig = {
	async rewrites() {
		return [
			{
				source: '/api/:path*',
				destination: `${BACKEND_URL}/api/:path*`,
			},
		];
	},
};

export default nextConfig;
