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

	let header: HTMLElement;

	/**
	 * Keeps --header-height equal to the real height of the sticky header, so scroll-padding-top
	 * on <html> keeps focused elements and anchor targets from hiding behind it (2.4.11). On a
	 * short window the header is not sticky and takes no room: 0.
	 */
	onMount(() => {
		const root = document.documentElement;
		const measure = () => {
			const sticky = getComputedStyle(header).position === 'sticky';
			root.style.setProperty(
				'--header-height',
				sticky ? `${header.getBoundingClientRect().height}px` : '0px'
			);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(header);
		// A short window turns sticky off without resizing the header.
		window.addEventListener('resize', measure);
		return () => {
			observer.disconnect();
			window.removeEventListener('resize', measure);
			root.style.removeProperty('--header-height');
		};
	});
</script>

<header class="site-header" bind:this={header}>
	<div class="bar">
		<!-- eslint-disable svelte/no-navigation-without-resolve -- hrefs come from resolve() through `home` -->
		<a
			class="brand"
			href={home}
			aria-label={m.header_home({ name: site === 'company' ? company.name : company.founder })}
		>
			{#if site === 'company'}
				<Logo size={108} />
			{:else}
				<span class="wordmark"><span class="dot" aria-hidden="true"></span>{company.founder}</span>
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
	.site-header {
		position: sticky;
		top: 0;
		z-index: 50;
		background: var(--header-fill);
		backdrop-filter: blur(8px);
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
		width: min(var(--content-max), calc(100% - 2rem));
		margin-inline: auto;
	}

	@media (min-width: 40rem) {
		.bar {
			width: min(var(--content-max), calc(100% - 2 * var(--gutter)));
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
		font-size: 0.8125rem;
		font-weight: 500;
		white-space: nowrap;
	}

	@media (min-width: 40rem) {
		.wordmark {
			gap: 0.5rem;
			font-size: 1rem;
		}
	}

	/* The pin-1 dot of a chip, as the personal mark. */
	.dot {
		width: 0.4rem;
		height: 0.4rem;
		border-radius: 50%;
		background: var(--trace-cyan);
		box-shadow: 0 0 6px var(--trace-cyan);
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
