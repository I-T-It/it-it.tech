import { robotsTxt } from '#lib/crawl.js';
import { siteUrl } from '#lib/site.js';
import type { RequestHandler } from './$types';

// Written once at build time, as robots.txt at the root of the site. A file, not a folder: the
// layout's trailing slash does not apply to endpoints.
export const prerender = true;
export const trailingSlash = 'never';

export const GET: RequestHandler = () =>
	new Response(robotsTxt(siteUrl), {
		headers: { 'content-type': 'text/plain; charset=utf-8' }
	});
