import { sitemapXml } from '#lib/crawl.js';
import { siteUrl } from '#lib/site.js';
import type { RequestHandler } from './$types';

// Written once at build time, as sitemap.xml at the root of the site.
export const prerender = true;
export const trailingSlash = 'never';

export const GET: RequestHandler = () =>
	new Response(sitemapXml(siteUrl), {
		headers: { 'content-type': 'application/xml' }
	});
