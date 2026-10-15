<script module lang="ts">
	import type { Talk } from '#lib/content/types.js';

	/** Newest date first. The content promises it already; equal dates keep their order. */
	export function newestTalksFirst(talks: readonly Talk[]): Talk[] {
		return [...talks].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
	}

	/** The fewest words that count as a passage in another language. */
	const MIN_WORDS = 3;

	/**
	 * The English words in a Dutch talk title: the run of words the title shares, from its start,
	 * with the English title of the same talk. Most Dutch titles are a translation and share
	 * nothing; a talk that was given in English keeps its English title, and the words around it
	 * ("(talk op JS Meetup)") are the Dutch part. A run cut short by an opening bracket loses the
	 * bracket. Returns undefined when the run is shorter than three words.
	 */
	export function foreignPhrase(dutch: string, english: string): string | undefined {
		const a = dutch.split(' ');
		const b = english.split(' ');
		let shared = 0;
		while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared++;
		// "again (talk op ...)" against "again (talk at ...)": the bracket belongs to the Dutch part.
		while (shared > 0 && a[shared - 1].startsWith('(') && shared < a.length) shared--;
		return shared >= MIN_WORDS ? a.slice(0, shared).join(' ') : undefined;
	}

	/** A title as text and English passages: [before, english, after], with "" where there is none. */
	export function splitTitle(title: string, phrase: string | undefined): [string, string, string] {
		const at = phrase ? title.indexOf(phrase) : -1;
		if (!phrase || at < 0) return [title, '', ''];
		return [title.slice(0, at), phrase, title.slice(at + phrase.length)];
	}
</script>

<script lang="ts">
	import Chip from '#lib/components/Chip.svelte';
	import { getContent } from '#lib/content/index.js';
	import { formatDay } from '#lib/format/period.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';

	const locale = getLocale();
	const content = getContent(locale).talks;
	const english = new Map(getContent('en').talks.talks.map((talk) => [talk.id, talk.title]));

	/**
	 * On the Dutch page a few titles are English, and a screen reader must switch voice for them
	 * (WCAG 3.1.2). The English page is English throughout, so it marks nothing.
	 */
	const parts = (talk: Talk) =>
		splitTitle(
			talk.title,
			locale === 'nl' ? foreignPhrase(talk.title, english.get(talk.id) ?? '') : undefined
		);
</script>

<Chip id="talks" designator="U7" labelledby="talks-title" side="both">
	<h2 id="talks-title">{content.title}</h2>
	{#if content.intro}
		<p class="intro">{content.intro}</p>
	{/if}

	<ul class="talks">
		{#each newestTalksFirst(content.talks) as talk (talk.id)}
			{@const [before, foreign, after] = parts(talk)}
			<li data-talk={talk.id}>
				<time datetime={talk.date}>{formatDay(talk.date, locale)}</time>
				<span class="title">
					{#snippet title()}
						{before}{#if foreign}<span lang="en">{foreign}</span>{/if}{after}
					{/snippet}
					{#if talk.url}
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an external address, not a route -->
						<a href={talk.url}
							>{@render title()}<span class="sr-only">{' ' + m.external_site()}</span></a
						>
					{:else}
						{@render title()}
					{/if}
				</span>
			</li>
		{/each}
	</ul>
</Chip>

<style>
	.intro {
		margin-bottom: 0;
		color: var(--ink-muted);
	}

	.talks {
		margin: 1.5rem 0 0;
		padding: 0;
		list-style: none;
	}

	.talks li {
		display: grid;
		gap: 0 1.5rem;
		padding-block: 0.5rem;
		border-bottom: 1px solid var(--silk-faint);
	}

	time {
		color: var(--ink-muted);
		font-family: var(--font-display);
		font-size: 0.875rem;
		line-height: 1.8;
		white-space: nowrap;
	}

	.title {
		min-width: 0;
		overflow-wrap: break-word;
	}

	/* The date takes a column of its own once there is room for one. */
	@media (min-width: 36rem) {
		.talks li {
			grid-template-columns: 7.5rem minmax(0, 1fr);
			align-items: baseline;
		}
	}
</style>
