<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale, locales, localizeHref, type Locale } from '#lib/paraglide/runtime.js';

	// The hash is only known in the browser. The prerender writes links without one; on mount and
	// on every hash change they pick up the current section, so the toggle lands on the same spot.
	let hash = $state('');
	const readHash = () => {
		hash = window.location.hash;
	};
	onMount(readHash);

	const locale = $derived(getLocale());

	/**
	 * The full name of a link, in the language it leads to. It contains the visible code ("EN"),
	 * so voice control and the Label in Name rule (2.5.3) hold. The current locale gets the plain
	 * name, the other one says it switches.
	 */
	function name(target: Locale, current: boolean): string {
		if (target === 'nl') return current ? m.language_is_nl() : m.language_to_nl();
		return current ? m.language_is_en() : m.language_to_en();
	}
</script>

<svelte:window onhashchange={readHash} />

<!--
	localizeHref needs the resolved path, so the lint rule cannot see the resolve() call.
	data-sveltekit-reload forces a full page load: lang and data-site live in the prerendered <html>,
	and client-side navigation would leave the old lang behind.
-->
<nav class="language" aria-label={m.language_label()}>
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	{#each locales as target (target)}
		{@const current = target === locale}
		<a
			href="{localizeHref(resolve('/'), { locale: target })}{hash}"
			hreflang={target}
			lang={target}
			aria-label={name(target, current)}
			aria-current={current ? 'true' : undefined}
			data-sveltekit-reload>{target.toUpperCase()}</a
		>
	{/each}
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
</nav>

<style>
	.language {
		display: flex;
		gap: 0.25rem;
	}

	/* Pointer targets are at least 24x24 CSS px (2.5.8): 28px wide, 32px high on a phone. */
	a {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.75rem;
		min-height: 2rem;
		padding-inline: 0.25rem;
		border-bottom: 2px solid transparent;
		color: var(--ink-muted);
		font-family: var(--font-display);
		font-size: 0.875rem;
		text-decoration: none;
	}

	/* The active locale: brighter text and an underline, so it never depends on colour alone. */
	a[aria-current='true'] {
		border-bottom-color: var(--ink);
		color: var(--ink);
		font-weight: 600;
	}

	@media (hover: hover) {
		a:hover {
			color: var(--ink);
		}
	}
</style>
