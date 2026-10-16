<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { company } from '#lib/content/company.js';
	import { m } from '#lib/paraglide/messages.js';
	import { localizeHref } from '#lib/paraglide/runtime.js';
	import { sectionIds, type SectionId } from '#lib/nav.js';
	import { site, variant } from '#lib/site.js';
	import LanguageToggle from './LanguageToggle.svelte';
	import Logo from './Logo.svelte';

	// The home page in the current locale, base path included. Anchors hang off it so they also
	// work from another page (the 404).
	const home = localizeHref(resolve('/'));

	/** The name of each section in the menu. Typed on SectionId: a new section needs a name here. */
	const labels: Record<SectionId, () => string> = {
		hero: () => m.nav_start(),
		job: () => m.nav_job(),
		freelance: () => m.nav_freelance(),
		about: () => m.nav_about(),
		competences: () => m.nav_competences(),
		experience: () => m.nav_experience(),
		projects: () => m.nav_projects(),
		skills: () => m.nav_skills(),
		talks: () => m.nav_talks(),
		education: () => m.nav_education(),
		contact: () => m.nav_contact()
	};

	/** Every section in the menu, one entry each, in page order. */
	const sections = sectionIds(variant.availabilityOrder);

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
	let menu: HTMLDetailsElement;

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

		// The menu is a native <details>: it opens and closes without any of this. The script only
		// closes it where the browser would leave it open: on Escape (focus goes back to the
		// button), and when focus leaves it.
		const menuKeydown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape' || !menu.open) return;
			menu.open = false;
			menu.querySelector('summary')?.focus();
		};
		const menuFocusOut = (event: FocusEvent) => {
			if (!menu.contains(event.relatedTarget as Node | null)) menu.open = false;
		};
		menu.addEventListener('keydown', menuKeydown);
		menu.addEventListener('focusout', menuFocusOut);

		return () => {
			observer.disconnect();
			watcher?.disconnect();
			window.removeEventListener('resize', measure);
			header.removeEventListener('focusin', focusIn);
			header.removeEventListener('focusout', focusOut);
			menu.removeEventListener('keydown', menuKeydown);
			menu.removeEventListener('focusout', menuFocusOut);
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
				<span class="wordmark"><span class="dot" aria-hidden="true"></span>{company.founder}</span>
			{/if}
		</a>

		<nav class="menu" aria-label={m.header_nav_label()}>
			<ul>
				<li>
					<details class="sections" bind:this={menu}>
						<summary>{m.nav_menu()}</summary>
						<ul class="panel">
							{#each sections as id (id)}
								<li>
									<a href="{home}#{id}" onclick={() => (menu.open = false)}>{labels[id]()}</a>
								</li>
							{/each}
						</ul>
					</details>
				</li>
				<li>
					<a class="contact" href="{home}#contact">{labels.contact()}</a>
				</li>
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

	/* The pin-1 dot of a chip, as the personal mark. */
	.dot {
		width: 0.375rem;
		height: 0.375rem;
		border-radius: 50%;
		background: var(--trace-cyan);
		box-shadow: 0 0 6px var(--trace-cyan);
	}

	.menu > ul {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.menu a,
	summary {
		display: inline-flex;
		align-items: center;
		min-height: 2rem;
		padding-inline: 0.375rem;
		color: var(--ink-muted);
		font-size: var(--text-small);
		text-decoration: none;
	}

	@media (min-width: 40rem) {
		.menu a,
		summary {
			padding-inline: 0.625rem;
		}
	}

	@media (hover: hover) {
		.menu a:hover,
		summary:hover {
			color: var(--ink);
			text-decoration: underline;
		}
	}

	/*
	 * Contact is also a button of its own beside the menu, once the bar has room for it. Below
	 * that it is only the last entry of the menu.
	 */
	.menu .contact {
		display: none;
		border: 1px solid var(--silk);
		border-radius: 0.25rem;
		color: var(--ink);
	}

	@media (min-width: 40rem) {
		.menu .contact {
			display: inline-flex;
		}
	}

	/*
	 * The menu button. A native <details>, so it works without script. The chevron is drawn: the
	 * corner of a square, turned (the same mark as the roles in Experience).
	 */
	summary {
		gap: 0.375rem;
		color: var(--ink);
		cursor: pointer;
		list-style: none;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary::after {
		content: '';
		flex: none;
		width: 0.4375rem;
		height: 0.4375rem;
		border-right: 2px solid var(--trace-cyan);
		border-bottom: 2px solid var(--trace-cyan);
		transform: translateY(-2px) rotate(45deg);
		transition: transform 0.2s ease;
	}

	details[open] > summary::after {
		transform: translateY(1px) rotate(225deg);
	}

	@media (prefers-reduced-motion: reduce) {
		summary::after {
			transition: none;
		}
	}

	:global(html.reduced) summary::after {
		transition: none;
	}

	/*
	 * Every section, in page order, in a panel under the bar, as wide as the content column. It is
	 * out of the flow (the header keeps its height) and solid, so the page behind it never
	 * muddies the text.
	 */
	.panel {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.125rem 0.5rem;
		width: min(var(--content-max), calc(100% - 2 * var(--gutter)));
		margin: 0 auto;
		padding: 0.5rem;
		box-sizing: border-box;
		border: 1px solid var(--silk-faint);
		border-top: 0;
		background: color-mix(in srgb, var(--board-navy) 40%, black);
		list-style: none;
	}

	@media (min-width: 40rem) {
		.panel {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}

	@media (min-width: 56rem) {
		.panel {
			grid-template-columns: repeat(5, minmax(0, 1fr));
		}
	}

	.panel a {
		display: flex;
		min-height: 2.5rem;
		padding-inline: 0.75rem;
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	/* On a very short window the header scrolls away; see --header-height in app.css. */
	@media (max-height: 30rem) {
		.site-header {
			position: static;
		}
	}
</style>
