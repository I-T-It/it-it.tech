<script module lang="ts">
	import type { Skill } from '#lib/content/types.js';

	/** Highest level first, then the most years. Equal skills keep their order. */
	export function sortSkills(skills: readonly Skill[]): Skill[] {
		return [...skills].sort((a, b) => b.level - a.level || b.years - a.years);
	}
</script>

<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import Chip from '#lib/components/Chip.svelte';
	import Leds from '#lib/components/Leds.svelte';
	import { getContent } from '#lib/content/index.js';
	import { filterableKeys, skillKeyFor } from '#lib/format/skills.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { EXPERIENCE_ID, skillFilter } from './skillFilter.svelte.js';

	const siteContent = getContent(getLocale());
	const content = siteContent.skills;
	const { labels } = content;
	const MAX_LEVEL = 5;

	/** The skills that at least one role has among its tags: only those can filter the roles. */
	const available = filterableKeys(siteContent.experience.jobs);

	/**
	 * True once scripts run. The links filter the roles, which needs them, so the prerender writes
	 * plain names and the links appear on hydration (the text does not move).
	 */
	let ready = $state(false);
	onMount(() => {
		ready = true;
	});

	/**
	 * Sets the filter and brings the visitor to it: scrolls to the Experience chip and puts focus
	 * on the chip that is on. A click with a modifier, or a middle click, keeps the link's own
	 * behaviour (a new tab opens the address, which restores the filter).
	 */
	async function show(event: MouseEvent, key: string) {
		if (event.defaultPrevented || event.button !== 0) return;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		skillFilter.select(key);
		await tick();
		const section = document.getElementById(EXPERIENCE_ID);
		section?.scrollIntoView();
		section
			?.querySelector<HTMLElement>('[data-filter] [aria-pressed="true"]')
			?.focus({ preventScroll: true });
	}

	const years = (skill: Skill) =>
		(skill.years === 1 ? labels.yearsOne : labels.years).replace('{years}', String(skill.years));

	/** What a screen reader reads for the LEDs: "niveau 5 van 5, 15 jaar". */
	const levelText = (skill: Skill) =>
		labels.level.replace('{level}', String(skill.level)).replace('{max}', String(MAX_LEVEL)) +
		', ' +
		years(skill);

	/**
	 * Sets `data-lit` on a group the first time it comes into view; the LEDs inside wait for it
	 * (see Leds `sequence`) and then light one after another. The attribute is never taken away
	 * and the observer lets go at once, so scrolling back does not replay the row. With reduced
	 * motion, or no observer, the group is lit from the start.
	 */
	const lightOnEnter: Attachment<HTMLElement> = (group) => {
		const reduced =
			document.documentElement.classList.contains('reduced') ||
			matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reduced || typeof IntersectionObserver === 'undefined') {
			group.setAttribute('data-lit', '');
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return;
				group.setAttribute('data-lit', '');
				observer.disconnect();
			},
			// Not at the very bottom edge: the group counts once its top is 15% up the window.
			{ rootMargin: '0px 0px -15% 0px' }
		);
		observer.observe(group);
		return () => observer.disconnect();
	};
</script>

<Chip id="skills" designator="U6" labelledby="skills-title" side="both">
	<h2 id="skills-title">{content.title}</h2>
	{#if content.intro}
		<p class="intro">{content.intro}</p>
	{/if}
	{#if ready}
		<p class="hint">{m.skills_filter_hint()}</p>
	{/if}

	<div class="groups">
		{#each content.groups as group (group.id)}
			<div class="group" data-group={group.id} {@attach lightOnEnter}>
				<h3>{group.title}</h3>
				<ul class="skills">
					{#each sortSkills(group.skills) as skill (skill.id)}
						{@const key = skillKeyFor(skill, available)}
						<li data-skill={skill.id}>
							<span class="name"
								>{#if ready && key}
									<!-- eslint-disable svelte/no-navigation-without-resolve -- a query and a hash on this page, which the browser resolves against the page address -->
									<a
										class="roles"
										href="?skill={key}#{EXPERIENCE_ID}"
										onclick={(event) => show(event, key)}
										>{skill.title}<span class="sr-only">{' ' + m.skills_show_roles()}</span></a
									>
									<!-- eslint-enable svelte/no-navigation-without-resolve -->
								{:else}
									{skill.title}
								{/if}</span
							>
							<span class="meter">
								<Leds level={skill.level} max={MAX_LEVEL} sequence text={levelText(skill)} />
								<!-- The years are in the level text above, which a screen reader reads. -->
								<span class="years" aria-hidden="true">{years(skill)}</span>
							</span>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>
</Chip>

<style>
	.intro {
		margin-bottom: 0;
		color: var(--ink-muted);
	}

	.hint {
		margin: 0.25rem 0 0;
		color: var(--ink-muted);
	}

	/* A skill with roles is a link, drawn with its underline. The box is as high as the line. */
	.roles {
		display: inline-block;
		min-width: 1.5rem;
		text-decoration-color: var(--led-color);
		text-decoration-thickness: 2px;
	}

	@media (hover: hover) {
		.roles:hover {
			text-decoration-thickness: 3px;
		}
	}

	/* Two columns where there is room: the left group is cyan, the right one green, like the traces. */
	.groups {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 24rem), 1fr));
		gap: 2rem clamp(1.5rem, 4vw, 3rem);
		margin-top: 1.75rem;
	}

	.group {
		--led-color: var(--trace-cyan);
		min-width: 0;
	}

	.group:nth-child(even) {
		--led-color: var(--trace-green);
	}

	/* A trace under the heading that fades out as it runs away from the label. */
	h3 {
		position: relative;
		margin-bottom: 0.75rem;
		padding-bottom: 0.625rem;
	}

	h3::after {
		content: '';
		position: absolute;
		inset: auto 0 0;
		height: 2px;
		background: linear-gradient(90deg, var(--led-color), transparent);
	}

	.skills {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.skills li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.125rem 0.75rem;
		padding-block: 0.3rem;
		border-bottom: 1px solid var(--silk-faint);
	}

	.name {
		flex: 1 1 7rem;
		overflow-wrap: break-word;
	}

	.meter {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 0.75rem;
	}

	.years {
		min-width: 4.5rem;
		color: var(--ink-muted);
		font-family: var(--font-display);
		font-size: 0.8125rem;
		text-align: right;
	}
</style>
