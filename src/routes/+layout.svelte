<script lang="ts">
	import '../app.css';
	import { resolve } from '$app/paths';
	import { locales, localizeHref, getLocale } from '#lib/paraglide/runtime.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<!-- Empty icon until S4 adds the real favicons to static/. -->
	<link rel="icon" href="data:," />
</svelte:head>

<!-- Stub until S4 ships the skip link, SiteHeader and LanguageToggle. -->
<a class="skip-link" href="#main">{m.skip_to_content()}</a>

<!--
	The same hrefs prove the base path in e2e. localizeHref needs the resolved path, so the lint rule
	cannot see the resolve() call. data-sveltekit-reload forces a full page load: lang and data-site
	live in the prerendered <html>, and client-side navigation would leave the old lang behind.
-->
<nav class="locale-stub" aria-label={m.language_label()}>
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	{#each locales as locale (locale)}
		<a
			href={localizeHref(resolve('/'), { locale })}
			hreflang={locale}
			data-sveltekit-reload
			aria-current={locale === getLocale() ? 'true' : undefined}>{locale}</a
		>
	{/each}
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
</nav>

{@render children()}

<style>
	.locale-stub {
		display: flex;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
	}

	/* Pointer targets are at least 24x24 CSS px (WCAG 2.5.8). */
	.locale-stub a {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 2rem;
		min-height: 2rem;
	}
</style>
