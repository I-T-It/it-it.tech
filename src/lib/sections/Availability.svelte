<script lang="ts">
	import { company } from '#lib/content/company.js';
	import { getContent } from '#lib/content/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { COMPANY_SITE_URL, site, variant } from '#lib/site.js';
	import Chip from '#lib/components/Chip.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import ProtectedEmail from '#lib/components/ProtectedEmail.svelte';

	const locale = getLocale();
	const { availability, hero } = getContent(locale);
	const { job, freelance } = availability;

	/** I.T. It in the language of this page. The personal build links here instead of mailing. */
	const companyUrl = COMPANY_SITE_URL + (locale === 'en' ? 'en/' : '');
</script>

<!--
	U1 (job) and U2 (freelance), in the order of the variant: the DOM order is the visual order.
	The wrapper is the target of the scroll indicator. It is a window high, and keeps 56px (the
	header) free at the top: after a jump from the very top the header slides in over that strip.
	The designators name the part, not the position: U1 is always the job, U2 the freelance chip.
	On a wide window the first chip faces the left gutter and the second the right one, so each
	takes its branches from the spine on its own side.
-->
<div id="availability" class="availability" tabindex="-1">
	{#each variant.availabilityOrder as path, i (path)}
		{@const side = i === 0 ? 'left' : 'right'}
		{#if path === 'job'}
			<Chip id="job" designator="U1" accent="cyan" {side} labelledby="job-title">
				<div class="inner">
					<h2 id="job-title">{job.title}</h2>
					{#each job.body as paragraph (paragraph)}
						<p>{paragraph}</p>
					{/each}
					<div class="actions">
						<!-- eslint-disable svelte/no-navigation-without-resolve -- an external address, not a route -->
						<a
							class={['cta', 'cta-job', variant.primaryPath === 'job' && 'cta-filled']}
							href={company.linkedin}
							>{job.cta}<span class="sr-only">{' ' + m.external_site()}</span></a
						>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
						<button type="button" class="cta" onclick={() => window.print()}>{job.print}</button>
					</div>
				</div>
			</Chip>
		{:else}
			<Chip id="freelance" designator="U2" accent="green" {side} labelledby="freelance-title">
				<div class="inner">
					<!--
						On the personal build the photo leads the page and I.T. It is one of two paths, so
						its logo is small and still, beside the title of its chip. The company build has the
						big logo in the hero and none here.
					-->
					<div class="title-row">
						<h2 id="freelance-title">{freelance.title}</h2>
						{#if site === 'personal'}
							<Logo size="clamp(5.5rem, 22vw, 7rem)" title={hero.logoAlt} />
						{/if}
					</div>
					{#each freelance.body as paragraph (paragraph)}
						<p>{paragraph}</p>
					{/each}
					<p class="hours">{freelance.hours}</p>
					<ul class="takes-on">
						{#each freelance.takesOn as item (item)}
							<li>{item}</li>
						{/each}
					</ul>
					<div class="actions">
						{#if site === 'company'}
							<ProtectedEmail
								variant="cta"
								label={freelance.cta}
								subject={freelance.emailSubject}
								class={variant.primaryPath === 'freelance'
									? 'cta-freelance cta-filled'
									: 'cta-freelance'}
							/>
						{:else}
							<!-- eslint-disable svelte/no-navigation-without-resolve -- an external address, not a route -->
							<a
								class={[
									'cta',
									'cta-freelance',
									variant.primaryPath === 'freelance' && 'cta-filled'
								]}
								href={companyUrl}
								>{freelance.cta}<span class="sr-only">{' ' + m.external_site()}</span></a
							>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						{/if}
					</div>
				</div>
			</Chip>
		{/if}
	{/each}
</div>

<style>
	.availability {
		display: grid;
		align-content: center;
		gap: clamp(2rem, 5vw, 3rem);
		min-height: 100vh;
		min-height: 100svh;
		padding-block: calc(var(--header-min) + 1rem) clamp(2rem, 6vw, 4rem);
	}

	@media (min-width: 56rem) {
		.availability {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			/* The inner pins of the two chips stick out 14px each: keep clear of one another. */
			column-gap: clamp(3rem, 6vw, 5rem);
		}
	}

	/*
	 * Side by side the two chips are as high as the taller one, and the actions sit on one line at
	 * the foot of each. That needs the chip to stretch its body; both are the Chip's own elements.
	 */
	.availability :global(.chip) {
		display: flex;
		flex-direction: column;
	}

	.availability :global(.chip > .body) {
		flex: 1;
	}

	.inner {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	/* The title takes what the small logo leaves, and the logo drops under it when there is no room. */
	.title-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.25rem 1rem;
	}

	.title-row h2 {
		flex: 1 1 12rem;
	}

	.title-row > :global(.logo) {
		flex: none;
		margin-bottom: 0.5rem;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: auto;
		padding-top: 1.25rem;
	}

	/* The freelance hours, set like a reading on a datasheet, with a short trace beside it. */
	.hours {
		margin-block: 0 1rem;
		padding-inline-start: 0.75rem;
		border-inline-start: 2px solid var(--path-freelance);
		font-family: var(--font-display);
		font-size: var(--text-small);
	}

	.takes-on {
		display: grid;
		gap: 0.375rem;
		margin: 0 0 0.5rem;
		padding: 0;
		list-style: none;
	}

	.takes-on li {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
	}

	/* A pad for every item. */
	.takes-on li::before {
		content: '';
		flex: none;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--pad-green);
		transform: translateY(-1px);
	}
</style>
