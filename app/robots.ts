import type { MetadataRoute } from 'next';

/** The admin is internal: every crawler is kept out of every page. */
export default function robots(): MetadataRoute.Robots {
	return { rules: [{ userAgent: '*', disallow: '/' }] };
}
