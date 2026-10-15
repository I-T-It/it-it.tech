<script lang="ts">
	import '../app.css';
	import { asset } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import SiteFooter from '#lib/components/SiteFooter.svelte';
	import SiteHeader from '#lib/components/SiteHeader.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={asset('favicon.ico')} sizes="32x32" />
	<link rel="icon" href={asset('favicon.svg')} type="image/svg+xml" />
	<link rel="apple-touch-icon" href={asset('apple-touch-icon.png')} />
</svelte:head>

<!-- The first stop for keyboard users. It goes to <main id="main">, which the page provides. -->
<a class="skip-link" href="#main">{m.skip_to_content()}</a>

<!-- The header waits above the window at the top of the page. An error page is too short for that. -->
<SiteHeader hideAtTop={!page.error} />

{@render children()}

<SiteFooter />
