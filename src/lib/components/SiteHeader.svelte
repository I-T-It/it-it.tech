<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { company } from '#lib/content/company.js';
	import { m } from '#lib/paraglide/messages.js';
	import { localizeHref } from '#lib/paraglide/runtime.js';
	import { site } from '#lib/site.js';
	import LanguageToggle from './LanguageToggle.svelte';
	import Logo from './Logo.svelte';

	// The home page in the current locale, base path included. Anchors hang off it so they also
	// work from another page (the 404).
	const home = localizeHref(resolve('/'));

	/** Desktop-only anchors, then Contact, which stays on every width. */
	const anchors = [
		{ id: 'about', label: () => m.nav_about(), desktop: true },
		{ id: 'experience', label: () => m.nav_experience(), desktop: true },
		{ id: 'skills', label: () => m.nav_skills(), desktop: true },
		{ id: 'talks', label: () => m.nav_talks(), desktop: true },
		{ id: 'contact', label: () => m.nav_contact(), desktop: false }
	];

	interface Props {
		/**
		 * Hide the header while the visitor is at the top of the page and slide it in once they
		 * have scrolled a bit. Turn it off for pages too short to scroll, like the 404.
		 */
		hideAtTop?: boolean;
	}

	let { hideAtTop = true }: Props = $props();

	let header: HTMLElement;
	let sentinel: HTMLElement;

	/** True once the visitor has scrolled past the sentinel (40% of the window, at most 200px). */
	let scrolled = $state(false);
	/** True while keyboard focus is inside the header. Focus always opens it (2.4.7, 2.4.11). */
	let focused = $state(false);

	const hidden = $derived(hideAtTop && !scrolled && !focused);

	/**
	 * Keeps --header-height equal to the height of the header while it covers the page, so
	 * scroll-padding-top on <html> keeps focused elements and anchor targets from hiding behind it
	 * (2.4.11). It is 0 while the header is hidden at the top, and on a short window where the
	 * header is not sticky and takes no room.
	 */
	function measure() {
		const position = getComputedStyle(header).position;
		const covers = position === 'sticky' || position === 'fixed';
		const concealed = hidden && position === 'fixed';
		document.documentElement.style.setProperty(
			'--header-height',
			covers && !concealed ? `${header.getBoundingClientRect().height}px` : '0px'
		);
	}

	onMount(() => {
		const observer = new ResizeObserver(measure);
		observer.observe(header);
		// A short window turns sticky off without resizing the header.
		window.addEventListener('resize', measure);

		// Scroll position without a scroll listener: the sentinel is a block at the top of the page,
		// and the header shows once it has left the window.
		const watcher =
			typeof IntersectionObserver === 'undefined'
				? undefined
				: new IntersectionObserver((entries) => {
						scrolled = !entries[entries.length - 1].isIntersecting;
					});
		if (watcher) watcher.observe(sentinel);
		else scrolled = true;

		const focusIn = () => (focused = true);
		const focusOut = (event: FocusEvent) => {
			if (!header.contains(event.relatedTarget as Node | null)) focused = false;
		};
		header.addEventListener('focusin', focusIn);
		header.addEventListener('focusout', focusOut);

		return () => {
			observer.disconnect();
			watcher?.disconnect();
			window.removeEventListener('resize', measure);
			header.removeEventListener('focusin', focusIn);
			header.removeEventListener('focusout', focusOut);
			document.documentElement.style.removeProperty('--header-height');
		};
	});

	// Measure again whenever the header goes into or comes out of hiding.
	$effect(() => {
		void hidden;
		measure();
	});
</script>

<!-- Decoration: marks the point where the header appears. It takes no room and no clicks. -->
<div class="top-sentinel" aria-hidden="true" bind:this={sentinel}></div>

<header class="site-header" data-hidden={hidden ? 'true' : undefined} bind:this={header}>
	<div class="bar">
		<!-- eslint-disable svelte/no-navigation-without-resolve -- hrefs come from resolve() through `home` -->
		<a
			class="brand"
			href={home}
			aria-label={m.header_home({ name: site === 'company' ? company.name : company.founder })}
		>
			{#if site === 'company'}
				<Logo size={72} />
			{:else}
				<!-- His photo in front of the name: the personal page is about him. The link is named by the text (aria-label), so the photo is decoration. -->
				<span class="wordmark"
					><enhanced:img
						class="avatar"
						src="../assets/robbin-schepers.jpg"
						alt=""
						sizes="28px"
					/>{company.founder}</span
				>
			{/if}
		</a>

		<nav class="menu" aria-label={m.header_nav_label()}>
			<ul>
				{#each anchors as anchor (anchor.id)}
					<li class:desktop={anchor.desktop}>
						<a href="{home}#{anchor.id}">{anchor.label()}</a>
					</li>
				{/each}
			</ul>
		</nav>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->

		<LanguageToggle />
	</div>
</header>

<style>
	/* 40% of the first window, at most 200px: the scroll at which the header appears. */
	.top-sentinel {
		position: absolute;
		top: 0;
		left: 0;
		width: 1px;
		height: min(40vh, 200px);
		pointer-events: none;
	}

	/*
	 * Without JS the header sticks in the flow of the page and is always there. With JS (html.js is
	 * set before the first paint) it is fixed, so it takes no room and nothing moves when it
	 * appears. At the top it waits above the window: moved and faded, not removed, so it stays in
	 * the accessibility tree and the tab order, and focus inside it brings it down.
	 */
	.site-header {
		position: sticky;
		top: 0;
		z-index: 50;
		background: var(--header-fill);
		backdrop-filter: blur(8px);
	}

	@media (min-height: 30.0625rem) {
		:global(html.js) .site-header {
			position: fixed;
			inset: 0 0 auto;
			transition:
				transform 0.3s ease,
				opacity 0.3s ease;
		}

		:global(html.js) .site-header[data-hidden='true']:not(:focus-within) {
			transform: translateY(-100%);
			opacity: 0;
			pointer-events: none;
		}
	}

	/* Reduced motion: it only shows and hides. */
	@media (prefers-reduced-motion: reduce) {
		:global(html.js) .site-header {
			transition: none;
		}
	}

	:global(html.js.reduced) .site-header {
		transition: none;
	}

	/* A trace along the bottom edge: cyan from the left, green from the right. */
	.site-header::after {
		content: '';
		position: absolute;
		inset: auto 0 0;
		height: 1px;
		background: linear-gradient(
			90deg,
			color-mix(in srgb, var(--trace-cyan) 65%, transparent),
			color-mix(in srgb, var(--trace-green) 65%, transparent)
		);
		pointer-events: none;
	}

	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0 0.5rem;
		min-height: var(--header-min);
		padding-block: 0.5rem;
		/* The same column as <main>, so the mark lines up with the content below it. */
		width: min(var(--content-max), calc(100% - 2 * var(--gutter)));
		margin-inline: auto;
	}

	@media (min-width: 40rem) {
		.bar {
			gap: 0 1.5rem;
		}
	}

	.brand {
		display: inline-flex;
		align-items: center;
		min-height: 2rem;
		margin-right: auto;
		color: var(--ink);
		text-decoration: none;
	}

	/* Small enough that name, Contact and the toggle share one row at 320 CSS px. */
	.wordmark {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-family: var(--font-display);
		font-size: 0.75rem;
		font-weight: 500;
		white-space: nowrap;
	}

	@media (min-width: 40rem) {
		.wordmark {
			gap: 0.5rem;
			font-size: 0.875rem;
		}
	}

	/* The personal mark: his face, small and round, with a trace-coloured ring like a lit pad. */
	.avatar {
		display: block;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 50%;
		object-fit: cover;
		object-position: 45% 25%;
		box-shadow:
			0 0 0 1.5px var(--trace-cyan),
			0 0 8px color-mix(in srgb, var(--trace-cyan) 60%, transparent);
	}

	/* On the narrowest windows (320 CSS px) the name, Contact and the toggle need the whole row. */
	@media (max-width: 21rem) {
		.avatar {
			display: none;
		}
	}

	ul {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* Over, Ervaring, Vaardigheden and Talks only fit on a wide screen. */
	li.desktop {
		display: none;
	}

	@media (min-width: 56rem) {
		li.desktop {
			display: list-item;
		}
	}

	.menu a {
		display: inline-flex;
		align-items: center;
		min-height: 2rem;
		padding-inline: 0.375rem;
		color: var(--ink-muted);
		font-size: var(--text-small);
		text-decoration: none;
	}

	@media (min-width: 40rem) {
		.menu a {
			padding-inline: 0.625rem;
		}
	}

	@media (hover: hover) {
		.menu a:hover {
			color: var(--ink);
			text-decoration: underline;
		}
	}

	/* Contact is the one anchor that is always there, so it looks like a control. */
	li:not(.desktop) a {
		border: 1px solid var(--silk);
		border-radius: 0.25rem;
		color: var(--ink);
	}

	/* On a very short window the header scrolls away; see --header-height in app.css. */
	@media (max-height: 30rem) {
		.site-header {
			position: static;
		}
	}
</style>
