<script lang="ts">
	import '../app.css';
	import { asset } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { site } from '#lib/site.js';
	import SiteFooter from '#lib/components/SiteFooter.svelte';
	import SiteHeader from '#lib/components/SiteHeader.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// The prerender writes <html lang> from the URL. 404.html is one Dutch file served at every
	// unknown address, /en/ ones too, where the page then runs in English: keep lang in step.
	$effect(() => {
		document.documentElement.lang = getLocale();
	});
</script>

<!--
	Each build links its own icons: the I.T. It logo for the company, a pixel-art green cowboy hat for
	the personal build. The other set is removed from the output by scripts/variant-icons.mjs.
-->
<svelte:head>
	<link rel="icon" href={asset(`icons/${site}/favicon.ico`)} sizes="16x16 32x32" />
	<link rel="icon" href={asset(`icons/${site}/favicon.svg`)} type="image/svg+xml" />
	<link rel="apple-touch-icon" href={asset(`icons/${site}/apple-touch-icon.png`)} />
</svelte:head>

<!-- The first stop for keyboard users. It goes to <main id="main">, which the page provides. -->
<a class="skip-link" href="#main">{m.skip_to_content()}</a>

<!--
	The header waits above the window at the top of the home page. The 404 is too short for that.
	It shows up three ways: as an error in the browser, as the prerendered not-found route (route
	id '/not-found'), and as that same file hydrated at the address that was not found, where the
	browser matches no route at all (route id null). Only the home page, which is long, hides it.
-->
<SiteHeader hideAtTop={page.route.id === '/'} />

{@render children()}

<SiteFooter />
