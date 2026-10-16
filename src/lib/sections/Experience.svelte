<script module lang="ts">
	import type { Job } from '#lib/content/types.js';

	/** Newest start first. The content promises it already; equal starts keep their order. */
	export function newestFirst(jobs: readonly Job[]): Job[] {
		return [...jobs].sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : 0));
	}
</script>

<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import Chip from '#lib/components/Chip.svelte';
	import { getContent } from '#lib/content/index.js';
	import { PERIOD_SEPARATOR, localeTag, periodParts } from '#lib/format/period.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';

	const locale = getLocale();
	const content = getContent(locale).experience;
	const jobs = newestFirst(content.jobs);

	/** "via Sopra Steria (consultant)", only on a role that has a source. */
	function employer(job: Job): string | undefined {
		if (!job.source) return undefined;
		return content.labels.via.replace('{employer}', content.labels.sources[job.source]);
	}

	/**
	 * What is inside the disclosure, in the words of the section labels: "Situatie, taken en
	 * resultaat". A role without results leaves that label out, so the button never promises it.
	 */
	function toggleLabel(job: Job): string {
		const { situation, tasks, results } = content.labels;
		const parts: string[] = [];
		if (job.situation.length) parts.push(situation);
		if (job.tasks.length) parts.push(tasks);
		if (job.results.length) parts.push(results);
		const tag = localeTag(locale);
		return new Intl.ListFormat(tag, { style: 'long', type: 'conjunction' }).format(
			parts.map((part, i) => (i === 0 ? part : part.toLocaleLowerCase(tag)))
		);
	}

	/** `io` once the observer has taken over from CSS. The stylesheet waits on it. */
	let driver = $state<'io'>();

	/**
	 * Lights each via as the visitor scrolls to it, where the browser cannot draw the timeline
	 * from the scroll position in CSS. With `animation-timeline: view()` the CSS does all of it
	 * and this does nothing. Under reduced motion everything stays drawn and nothing is watched.
	 * A via that is lit stays lit: the observer lets go of it.
	 */
	const lightVias: Attachment<HTMLOListElement> = (list) => {
		const reduced =
			document.documentElement.classList.contains('reduced') ||
			matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reduced || CSS.supports('animation-timeline', 'view()')) return;

		driver = 'io';
		const vias = Array.from(list.querySelectorAll<HTMLElement>('.via'));
		const light = (via: Element) => via.setAttribute('data-lit', '');

		if (typeof IntersectionObserver === 'undefined') {
			vias.forEach(light);
			return;
		}

		// The front is at 60% of the window, like the spine of the board: the bottom 40% is cut off.
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					// A via that is above the window was scrolled past, e.g. after a deep link: lit.
					const passed = entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0);
					if (entry.isIntersecting || passed) {
						light(entry.target);
						observer.unobserve(entry.target);
					}
				}
			},
			{ rootMargin: '0px 0px -40% 0px' }
		);
		vias.forEach((via) => observer.observe(via));
		return () => observer.disconnect();
	};
</script>

<Chip id="experience" designator="U5" labelledby="experience-title" side="both">
	<h2 id="experience-title">{content.title}</h2>
	{#if content.intro}
		<p class="intro">{content.intro}</p>
	{/if}

	<ol class="timeline" data-driver={driver} {@attach lightVias}>
		{#each jobs as job, i (job.id)}
			{@const [from, to] = periodParts(job.start, job.end, locale, content.labels.present)}
			{@const via = employer(job)}
			{@const hasDetails = job.situation.length + job.tasks.length + job.results.length > 0}
			<li class="job" id="job-{job.id}">
				<!-- The timeline is decoration: a trace down the left with a via at every role. -->
				<span class="rail" aria-hidden="true">
					<span class="via"></span>
					{#if i < jobs.length - 1}
						<span class="trace"></span>
					{/if}
				</span>

				<div class="role">
					<div class="head">
						<div>
							<h3 class="title">{job.title}</h3>
							<p class="org">
								{job.organisation}{#if via}<span class="employer">{' ' + via}</span>{/if}
							</p>
						</div>
						<p class="period">
							<time datetime={from.iso}>{from.text}</time>{PERIOD_SEPARATOR}{#if to.iso}<time
									datetime={to.iso}>{to.text}</time
								>{:else}{to.text}{/if}
						</p>
					</div>

					{#if job.tech.length}
						<ul class="tech">
							{#each job.tech as tech (tech)}
								<li>{tech}</li>
							{/each}
						</ul>
					{/if}

					{#if hasDetails}
						<details>
							<summary
								><span class="toggle">{toggleLabel(job)}</span><span class="sr-only"
									>{' ' + job.title + ', ' + job.organisation}</span
								></summary
							>
							<dl class="detail">
								{#if job.situation.length}
									<div>
										<dt>{content.labels.situation}</dt>
										<dd>
											{#each job.situation as paragraph (paragraph)}
												<p>{paragraph}</p>
											{/each}
										</dd>
									</div>
								{/if}
								{#if job.tasks.length}
									<div>
										<dt>{content.labels.tasks}</dt>
										<dd>
											<ul>
												{#each job.tasks as task (task)}
													<li>{task}</li>
												{/each}
											</ul>
										</dd>
									</div>
								{/if}
								{#if job.results.length}
									<div>
										<dt>{content.labels.results}</dt>
										<dd>
											<ul class="results">
												{#each job.results as result (result.text)}
													<li>
														{#if result.url}
															<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an external address, not a route -->
															<a href={result.url}
																>{result.text}<span class="sr-only">{' ' + m.external_site()}</span
																></a
															>
														{:else}
															{result.text}
														{/if}
													</li>
												{/each}
											</ul>
										</dd>
									</div>
								{/if}
							</dl>
						</details>
					{/if}
				</div>
			</li>
		{/each}
	</ol>
</Chip>

<style>
	.intro {
		margin-bottom: 0;
		color: var(--ink-muted);
	}

	/*
	 * The timeline: a trace down the left edge with a via (a plated hole) at every role. Each
	 * trace runs from the via of its role to the via of the next one, so a role is as tall as
	 * its trace. The ring colour is the state: dim until the trace reaches it, then lit.
	 */
	.timeline {
		--rail: 1.5rem;
		--via: 1rem;
		/* The via sits level with the first line of the title. */
		--via-top: 0.2rem;
		--via-lit: var(--trace-cyan);
		--via-off: var(--silk-faint);
		--hole: color-mix(in srgb, var(--board-navy) 65%, black);
		list-style: none;
		margin: 1.75rem 0 0;
		padding: 0;
	}

	.job {
		display: grid;
		grid-template-columns: var(--rail) minmax(0, 1fr);
		column-gap: 0.75rem;
	}

	.rail {
		position: relative;
	}

	.via {
		position: absolute;
		z-index: 1;
		top: var(--via-top);
		left: 50%;
		width: var(--via);
		height: var(--via);
		margin-left: calc(var(--via) / -2);
		box-sizing: border-box;
		border: 4px solid var(--via-lit);
		border-radius: 50%;
		background: var(--hole);
		box-shadow: 0 0 8px color-mix(in srgb, var(--via-lit) 70%, transparent);
		transition:
			border-color 0.3s ease,
			box-shadow 0.3s ease;
	}

	/* From the centre of this via to the centre of the next one, which is below the role. */
	.trace {
		position: absolute;
		top: calc(var(--via-top) + var(--via) / 2);
		bottom: calc(-1 * (var(--via-top) + var(--via) / 2));
		left: 50%;
		width: 2px;
		margin-left: -1px;
		background: var(--via-lit);
		box-shadow: 0 0 6px color-mix(in srgb, var(--via-lit) 55%, transparent);
		transform: scaleY(1);
		transform-origin: top;
		transition: transform 0.6s ease-out;
	}

	/*
	 * Waiting. Only with JS, motion allowed, and an observer to light the via: otherwise (no JS,
	 * reduced motion, or the browser draws it from the scroll) everything is drawn from the start.
	 * Without animation-timeline support the rule applies before the script has run, so the page
	 * does not flash lit and then dark.
	 */
	@supports not (animation-timeline: view()) {
		:global(html.js:not(.reduced)) .via:not([data-lit]) {
			border-color: var(--via-off);
			box-shadow: none;
		}

		:global(html.js:not(.reduced)) .via:not([data-lit]) + .trace {
			transform: scaleY(0);
		}
	}

	:global(html.js:not(.reduced)) .timeline[data-driver='io'] .via:not([data-lit]) {
		border-color: var(--via-off);
		box-shadow: none;
	}

	:global(html.js:not(.reduced)) .timeline[data-driver='io'] .via:not([data-lit]) + .trace {
		transform: scaleY(0);
	}

	/*
	 * Where the browser has animation-timeline, CSS draws the timeline from the scroll position,
	 * both ways, and no script runs. The timeline's bottom edge is pulled up by 40%, so an element
	 * "enters" when its top passes 60% of the window height: the front of the trace. A trace is
	 * drawn as its role passes the front, and its via lights as the front reaches it.
	 */
	@supports (animation-timeline: view()) {
		@media (prefers-reduced-motion: no-preference) {
			:global(html:not(.reduced)) .timeline:not([data-driver='io']) .via {
				animation: via-light linear both;
				animation-timeline: view(block 0px 40%);
				animation-range: entry 0% entry 100%;
			}

			:global(html:not(.reduced)) .timeline:not([data-driver='io']) .trace {
				animation: trace-draw linear both;
				animation-timeline: view(block 0px 40%);
				animation-range: entry 0% entry 100%;
			}
		}
	}

	@keyframes via-light {
		from {
			border-color: var(--via-off);
			box-shadow: none;
		}
		to {
			border-color: var(--via-lit);
			box-shadow: 0 0 8px color-mix(in srgb, var(--via-lit) 70%, transparent);
		}
	}

	@keyframes trace-draw {
		from {
			transform: scaleY(0);
		}
		to {
			transform: scaleY(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.via,
		.trace {
			transition: none;
		}
	}

	:global(html.reduced) .via,
	:global(html.reduced) .trace {
		transition: none;
	}

	.role {
		min-width: 0;
		padding-bottom: 2.25rem;
	}

	.job:last-child .role {
		padding-bottom: 0;
	}

	.head {
		display: grid;
		gap: 0.25rem 1.5rem;
	}

	.title {
		margin: 0;
		font-size: var(--text-h3);
		overflow-wrap: anywhere;
	}

	.org {
		margin: 0.125rem 0 0;
		color: var(--ink-muted);
	}

	.period {
		margin: 0;
		color: var(--ink-muted);
		font-family: var(--font-display);
		font-size: 0.875rem;
		line-height: 1.6;
	}

	@media (min-width: 40rem) {
		.head {
			grid-template-columns: minmax(0, 1fr) auto;
		}

		.period {
			padding-top: 0.2rem;
			white-space: nowrap;
		}
	}

	/* Technologies: small parts with a pad at each end, like surface-mount components. */
	.tech {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		margin: 0.75rem 0 0;
		padding: 0;
		list-style: none;
	}

	.tech li {
		padding: 0.0625rem 0.5rem;
		border: 1px solid var(--silk-faint);
		border-inline-width: 3px;
		color: var(--ink-muted);
		font-family: var(--font-display);
		font-size: 0.8125rem;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}

	details {
		margin-top: 0.5rem;
	}

	summary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 2.75rem;
		padding-block: 0.25rem;
		font-family: var(--font-display);
		font-size: 0.875rem;
		cursor: pointer;
		list-style: none;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	/* The chevron: a corner of a square, turned. It is drawn, not read. */
	summary::before {
		content: '';
		flex: none;
		width: 0.5rem;
		height: 0.5rem;
		border-right: 2px solid var(--trace-cyan);
		border-bottom: 2px solid var(--trace-cyan);
		transform: translateY(-1px) rotate(-45deg);
		transition: transform 0.2s ease;
	}

	details[open] > summary::before {
		transform: translateY(-3px) rotate(45deg);
	}

	.toggle {
		text-decoration: underline;
		text-decoration-color: var(--silk);
		text-decoration-thickness: 1px;
		text-underline-offset: 0.25em;
	}

	@media (prefers-reduced-motion: reduce) {
		summary::before {
			transition: none;
		}
	}

	:global(html.reduced) summary::before {
		transition: none;
	}

	.detail {
		display: grid;
		/* minmax(0, ...): a long word must break, not push the track wider than the chip. */
		grid-template-columns: minmax(0, 1fr);
		gap: 1rem;
		margin: 0.25rem 0 0;
		padding-left: 1rem;
		border-left: 1px solid var(--silk-faint);
	}

	dt {
		margin-bottom: 0.25rem;
		color: var(--ink-muted);
		font-family: var(--font-display);
		font-size: 0.8125rem;
	}

	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}

	dd p {
		margin-bottom: 0.5em;
	}

	dd p:last-child {
		margin-bottom: 0;
	}

	dd ul {
		margin: 0;
		padding-left: 1.1rem;
	}

	dd li {
		margin-bottom: 0.25rem;
		max-width: var(--measure);
		overflow-wrap: anywhere;
	}
</style>
