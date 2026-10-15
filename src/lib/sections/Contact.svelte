<script lang="ts">
	import { company } from '#lib/content/company.js';
	import { getContent } from '#lib/content/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { COMPANY_SITE_URL, site } from '#lib/site.js';
	import Chip from '#lib/components/Chip.svelte';
	import ProtectedEmail from '#lib/components/ProtectedEmail.svelte';

	const locale = getLocale();
	const contact = getContent(locale).contact;

	/** I.T. It in the language of this page. The personal build links here instead of showing an email. */
	const companyUrl = COMPANY_SITE_URL + (locale === 'en' ? 'en/' : '');
</script>

<!--
	U9. Each way to reach him is a pad at the end of a short trace, like the icon pads on the back
	of the business card. The pads are decoration; each row has exactly one link, and its text
	says what it is. Only the company build shows an email address: the personal build links to
	I.T. It instead. The whole row is clickable (the link stretches over it), the link keeps the
	focus ring.
-->
<Chip id="contact" designator="U9" side="both" labelledby="contact-title">
	<h2 id="contact-title">{contact.title}</h2>
	{#if contact.intro}
		<p class="intro">{contact.intro}</p>
	{/if}

	<ul class="ways">
		{#if site === 'company'}
			<li class="way way-freelance">
				<span class="stub" aria-hidden="true"></span>
				<span class="pad" aria-hidden="true">
					<svg viewBox="0 0 24 24" focusable="false">
						<rect x="3" y="5" width="18" height="14" rx="2" />
						<path d="m3.5 7 8.5 6.5L20.5 7" />
					</svg>
				</span>
				<ProtectedEmail class="way-link" />
			</li>
		{/if}

		<li class="way way-job">
			<span class="stub" aria-hidden="true"></span>
			<span class="pad" aria-hidden="true">
				<svg viewBox="0 0 24 24" focusable="false">
					<rect x="3" y="3" width="18" height="18" rx="3" />
					<path d="M8 10.5V16M8 7.8v.01M12 16v-5.5M12 13c0-1.5 1-2.5 2.3-2.5s2.2 1 2.2 2.6V16" />
				</svg>
			</span>
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an external address, not a route -->
			<a class="way-link" href={company.linkedin}
				>{contact.labels.linkedin}<span class="sr-only">{' ' + m.external_site()}</span></a
			>
		</li>

		<li class="way way-github">
			<span class="stub" aria-hidden="true"></span>
			<span class="pad" aria-hidden="true">
				<svg viewBox="0 0 24 24" focusable="false">
					<circle cx="6" cy="6" r="2.2" />
					<circle cx="6" cy="18" r="2.2" />
					<circle cx="18" cy="8" r="2.2" />
					<path d="M6 8.2v7.6M18 10.2c0 4-4 4-10.2 6.2" />
				</svg>
			</span>
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an external address, not a route -->
			<a class="way-link" href={company.github}
				>{contact.labels.github} <span class="handle">{company.githubHandle}</span><span
					class="sr-only">{' ' + m.external_site()}</span
				></a
			>
		</li>

		{#if site === 'personal'}
			<li class="way way-freelance">
				<span class="stub" aria-hidden="true"></span>
				<span class="pad" aria-hidden="true">
					<svg viewBox="0 0 24 24" focusable="false">
						<rect x="7" y="7" width="10" height="10" rx="1" />
						<path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" />
					</svg>
				</span>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an external address, not a route -->
				<a class="way-link" href={companyUrl}
					>{contact.labels.company}<span class="sr-only">{' ' + m.external_site()}</span></a
				>
			</li>
		{/if}
	</ul>
</Chip>

<style>
	.intro {
		color: var(--ink-muted);
	}

	.ways {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
		gap: 1rem 2rem;
		margin: 1.25rem 0 0;
		padding: 0;
		list-style: none;
	}

	/* --way is the colour of the trace and the pad: job is cyan, freelance and I.T. It green. */
	.way {
		--way: var(--ink);
		position: relative;
		display: flex;
		align-items: center;
		min-height: 3rem;
	}

	.way-job {
		--way: var(--path-job);
	}

	.way-freelance {
		--way: var(--path-freelance);
	}

	/* The trace that ends in the pad: it fades in from the left. */
	.stub {
		flex: none;
		width: 1.5rem;
		height: 2px;
		background: linear-gradient(90deg, transparent, var(--way));
	}

	.pad {
		display: grid;
		flex: none;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		margin-right: 0.9rem;
		border: 2px solid var(--way);
		border-radius: 50%;
		background: var(--chip-fill);
		color: var(--way);
	}

	.pad svg {
		width: 1.25rem;
		height: 1.25rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.75;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	/* The link stretches over the whole row, so the pad is part of the target. */
	.ways :global(.way-link) {
		display: inline-flex;
		align-items: center;
		min-height: 2.75rem;
		overflow-wrap: anywhere;
	}

	.ways :global(.way-link)::after {
		content: '';
		position: absolute;
		inset: 0;
	}

	.handle {
		margin-left: 0.4em;
		color: var(--ink-muted);
		font-size: var(--text-small);
	}
</style>
