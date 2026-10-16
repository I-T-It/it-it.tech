<script lang="ts">
	import { company } from '#lib/content/company.js';
	import { getContent } from '#lib/content/index.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import {
		alternates,
		jsonLdCompany,
		jsonLdPersonal,
		jsonLdScriptTag,
		OG_IMAGE,
		ogImageUrl,
		ogLocale,
		pageUrl,
		THEME_COLOR
	} from '#lib/seo.js';
	import { PERSONAL_SITE_URL, site, siteUrl } from '#lib/site.js';

	const locale = getLocale();
	const otherLocale = locale === 'en' ? 'nl' : 'en';
	const meta = getContent(locale).meta[site];

	/** One address per page: a query (?skill=) or a hash (#talks) folds into it. */
	const url = pageUrl(siteUrl, locale);
	const image = ogImageUrl(siteUrl, locale);

	// The company graph is built behind this check, so the personal bundle drops it together with
	// the VAT and KvK numbers it reads.
	const jsonLd =
		site === 'company'
			? jsonLdCompany({ siteUrl, personalUrl: PERSONAL_SITE_URL, locale, meta })
			: jsonLdPersonal({ siteUrl, locale, meta });

	// The data is ours and the serializer escapes every "<", so it cannot close the element.
	const script = jsonLdScriptTag(jsonLd);
</script>

<!--
	Everything a search engine or a link preview reads. The page title is page copy, so title,
	description and image text live in the content files. The preview card is og/<locale>.png.
	No generator tag and no email address anywhere.
-->
<svelte:head>
	<title>{meta.title}</title>
	<meta name="description" content={meta.description} />
	<link rel="canonical" href={url} />
	{#each alternates(siteUrl) as { hreflang, href } (hreflang)}
		<link rel="alternate" {hreflang} {href} />
	{/each}

	<meta property="og:site_name" content={site === 'company' ? company.name : company.founder} />
	<meta property="og:title" content={meta.title} />
	<meta property="og:description" content={meta.description} />
	<meta property="og:url" content={url} />
	<meta property="og:type" content={site === 'company' ? 'website' : 'profile'} />
	{#if site === 'personal'}
		<meta property="profile:first_name" content={company.givenName} />
		<meta property="profile:last_name" content={company.familyName} />
		<meta property="profile:username" content={company.nickname} />
	{/if}
	<meta property="og:locale" content={ogLocale[locale]} />
	<meta property="og:locale:alternate" content={ogLocale[otherLocale]} />
	<meta property="og:image" content={image} />
	<meta property="og:image:width" content={String(OG_IMAGE.width)} />
	<meta property="og:image:height" content={String(OG_IMAGE.height)} />
	<meta property="og:image:type" content={OG_IMAGE.type} />
	<meta property="og:image:alt" content={meta.ogImageAlt} />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:image:alt" content={meta.ogImageAlt} />
	<meta name="theme-color" content={THEME_COLOR} />

	<!-- eslint-disable-next-line svelte/no-at-html-tags -- our own data, every "<" escaped -->
	{@html script}
</svelte:head>
