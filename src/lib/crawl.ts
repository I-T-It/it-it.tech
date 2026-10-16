/**
 * The files crawlers read: robots.txt and sitemap.xml. Pure functions of the site url, so they
 * are tested without a build; src/routes/robots.txt and src/routes/sitemap.xml prerender them.
 */

/** The two home pages of a build, as absolute urls on its own origin and base path. */
export function pageUrls(siteUrl: string): { nl: string; en: string } {
	return { nl: `${siteUrl}/`, en: `${siteUrl}/en/` };
}

/** Every crawler may read everything. The only line besides that points at the sitemap. */
export function robotsTxt(siteUrl: string): string {
	return ['User-agent: *', 'Allow: /', '', `Sitemap: ${siteUrl}/sitemap.xml`, ''].join('\n');
}

/** The five characters XML text and attribute values must not contain as they are. */
export function xmlEscape(text: string): string {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

/**
 * Both home pages, each with the three alternates (nl, en, x-default pointing at nl), all on the
 * site url. No lastmod: a date that changes on every deploy tells a crawler nothing.
 */
export function sitemapXml(siteUrl: string): string {
	const { nl, en } = pageUrls(siteUrl);
	const alternates = [
		['nl', nl],
		['en', en],
		['x-default', nl]
	]
		.map(
			([hreflang, href]) =>
				`    <xhtml:link rel="alternate" hreflang="${hreflang}" href="${xmlEscape(href)}"/>`
		)
		.join('\n');
	const entries = [nl, en]
		.map((loc) => `  <url>\n    <loc>${xmlEscape(loc)}</loc>\n${alternates}\n  </url>`)
		.join('\n');
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
		entries,
		'</urlset>',
		''
	].join('\n');
}
