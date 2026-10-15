<script module lang="ts">
	import type { Skill } from '#lib/content/types.js';

	/** Highest level first, then the most years. Equal skills keep their order. */
	export function sortSkills(skills: readonly Skill[]): Skill[] {
		return [...skills].sort((a, b) => b.level - a.level || b.years - a.years);
	}
</script>

<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import Chip from '#lib/components/Chip.svelte';
	import Leds from '#lib/components/Leds.svelte';
	import { getContent } from '#lib/content/index.js';
	import { getLocale } from '#lib/paraglide/runtime.js';

	const content = getContent(getLocale()).skills;
	const { labels } = content;
	const MAX_LEVEL = 5;

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

	<div class="groups">
		{#each content.groups as group (group.id)}
			<div class="group" data-group={group.id} {@attach lightOnEnter}>
				<h3>{group.title}</h3>
				<ul class="skills">
					{#each sortSkills(group.skills) as skill (skill.id)}
						<li data-skill={skill.id}>
							<span class="name">{skill.title}</span>
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
