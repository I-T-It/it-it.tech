<script module lang="ts">
	// The scheme is assembled so the literal never appears in source or in the built files.
	const SCHEME = ['mail', 'to'].join('') + ':';

	function mailHref(address: string, subject?: string): string {
		return SCHEME + address + (subject ? `?subject=${encodeURIComponent(subject)}` : '');
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { decodeEmail, EMAIL_FALLBACK_TEXT } from '#lib/email.js';

	interface Props {
		/** `address`: the address is the link text. `cta`: the label is, as a button-style link. */
		variant?: 'address' | 'cta';
		/** Link text of the `cta` variant. Without it the address is shown. */
		label?: string;
		/** Mail subject. Not secret, the address is. */
		subject?: string;
		/** Extra classes, e.g. `cta-filled cta-freelance` for the `cta` variant. */
		class?: string;
	}

	let { variant = 'address', label, subject, class: className }: Props = $props();

	/**
	 * Stays undefined during prerender and until mount, so the built files hold no address.
	 * It is set on mount, not on click: printing, screen readers and copy-paste all see the real
	 * address after JS has run. This component belongs to the company build only; the personal
	 * build must not import it (see the `site === 'company'` checks in the sections).
	 */
	let address = $state<string>();

	onMount(() => {
		address = decodeEmail();
	});

	const href = $derived(address ? mailHref(address, subject) : '#contact');
	const showLabel = $derived(variant === 'cta' && label);
</script>

<!--
	Before mount (and without JS) this is a link to the contact section that shows the address
	spelled out. After mount the same element becomes the mail link. It is one element, so focus
	survives the swap. No aria-label: the accessible name is the visible text (2.5.3).
-->
<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- a fragment or a mail link, not a route -->
<a class={['email', variant === 'cta' && 'cta', className]} {href}>
	{#if showLabel}
		{label}{#if !address}<span class="email-fallback"> {EMAIL_FALLBACK_TEXT}</span>{/if}
	{:else}
		{address ?? EMAIL_FALLBACK_TEXT}
	{/if}
</a>

<style>
	/* The label and, without JS, the spelled-out address under it. */
	.email.cta {
		flex-direction: column;
		gap: 0.125rem;
	}

	.email-fallback {
		display: block;
		font-size: 0.8125rem;
		font-weight: 400;
	}

	/*
	 * With JS (html.js is set before the first paint) the fallback never shows, so the button
	 * keeps its size while the page hydrates. Without JS it is the only way to read the address.
	 */
	:global(html.js) .email-fallback {
		display: none;
	}
</style>
