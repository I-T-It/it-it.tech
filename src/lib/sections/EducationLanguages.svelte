<script lang="ts">
	import Chip from '#lib/components/Chip.svelte';
	import Leds from '#lib/components/Leds.svelte';
	import { getContent } from '#lib/content/index.js';
	import type { SpokenLanguage } from '#lib/content/types.js';
	import { getLocale } from '#lib/paraglide/runtime.js';

	const content = getContent(getLocale()).educationLanguages;
	// The level words are the ones of the skills; the languages have only a note of their own.
	const { level: levelLabel } = getContent(getLocale()).skills.labels;
	const MAX_LEVEL = 5;

	/** What a screen reader reads for the LEDs and the note: "niveau 2 van 5, basis". */
	const levelText = (language: SpokenLanguage) =>
		levelLabel.replace('{level}', String(language.level)).replace('{max}', String(MAX_LEVEL)) +
		(language.note ? `, ${language.note}` : '');
</script>

<Chip id="education" designator="U8" labelledby="education-title" side="both">
	<h2 id="education-title">{content.title}</h2>
	{#if content.intro}
		<p class="intro">{content.intro}</p>
	{/if}

	<div class="columns">
		<div class="column">
			<h3>{content.labels.education}</h3>
			<ul>
				{#each content.education as course (course.id)}
					<li data-education={course.id}>
						<span class="what">{course.title}</span>
						<span class="meta"
							>{course.institution}, <time datetime={String(course.year)}>{course.year}</time></span
						>
					</li>
				{/each}
			</ul>
		</div>

		<div class="column">
			<h3>{content.labels.languages}</h3>
			<ul>
				{#each content.languages as language (language.id)}
					<li data-language={language.id}>
						<span class="what">{language.title}</span>
						<span class="meter">
							<Leds level={language.level} max={MAX_LEVEL} text={levelText(language)} />
							{#if language.note}
								<!-- Read with the level above, so not read twice. -->
								<span class="note" aria-hidden="true">{language.note}</span>
							{/if}
						</span>
					</li>
				{/each}
			</ul>
		</div>
	</div>
</Chip>

<style>
	.intro {
		margin-bottom: 0;
		color: var(--ink-muted);
	}

	.columns {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
		gap: 2rem clamp(1.5rem, 4vw, 3rem);
		margin-top: 1.5rem;
	}

	.column {
		/* Education sits on the left side of the board (cyan), the languages on the right (green). */
		--led-color: var(--trace-cyan);
		min-width: 0;
	}

	.column:nth-child(even) {
		--led-color: var(--trace-green);
	}

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

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.125rem 0.75rem;
		padding-block: 0.4rem;
		border-bottom: 1px solid var(--silk-faint);
	}

	.what {
		flex: 1 1 8rem;
		overflow-wrap: break-word;
	}

	.meta,
	.note {
		color: var(--ink-muted);
		font-family: var(--font-display);
		font-size: 0.8125rem;
	}

	.meter {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 0.75rem;
	}
</style>
