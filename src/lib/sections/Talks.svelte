<script module lang="ts">
	import type { Locale, TalkGiven, TalkOffer, Talks } from '#lib/content/types.js';
	import { localeTag } from '#lib/format/period.js';

	/** Newest date first. The content promises it already; equal dates keep their order. */
	export function newestGivenFirst<T extends Pick<TalkGiven, 'date'>>(given: readonly T[]): T[] {
		return [...given].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
	}

	/**
	 * How often an offer was given and when it was last given, from the history. ISO dates sort as
	 * text, a month ("2023-03") before any day of it. An offer that was never given has no `last`.
	 */
	export function offerStats(
		offerId: string,
		given: readonly Pick<TalkGiven, 'offerId' | 'date'>[]
	): { count: number; last?: string } {
		const dates = given.filter((g) => g.offerId === offerId).map((g) => g.date);
		return dates.length
			? { count: dates.length, last: dates.reduce((a, b) => (a > b ? a : b)) }
			: { count: 0 };
	}

	/**
	 * The language to mark a title with, where it differs from the page. An English title stays as
	 * it is in both locales, so on the Dutch page a screen reader must switch voice for it (WCAG
	 * 3.1.2). A Dutch title is translated for the English page. This is about the title only: a
	 * talk can be given in Dutch under an English title.
	 */
	export function foreignTitleLang(
		offer: Pick<TalkOffer, 'titleLang'>,
		locale: Locale
	): Locale | undefined {
		return offer.titleLang === 'en' && locale !== 'en' ? 'en' : undefined;
	}

	export interface Fact {
		label: string;
		value: string;
	}

	/**
	 * What a visitor wants to know first: the languages ("Nederlands of Engels", "Dutch or
	 * English", in the order of the content), then the duration and the audience when known.
	 */
	export function offerFacts(offer: TalkOffer, labels: Talks['labels'], locale: Locale): Fact[] {
		const languages = new Intl.ListFormat(localeTag(locale), {
			style: 'long',
			type: 'disjunction'
		}).format(offer.langs.map((lang) => labels.language[lang]));
		const facts: Fact[] = [{ label: labels.facts.language, value: languages }];
		if (offer.duration) facts.push({ label: labels.facts.duration, value: offer.duration });
		if (offer.audience) facts.push({ label: labels.facts.audience, value: offer.audience });
		return facts;
	}

	/** A title around the place of the talk quoted in it: [before, after]. No place: [title, ""]. */
	export function splitTalkTitle(title: string): [string, string] {
		const [before, after = ''] = title.split('{talk}');
		return [before, after];
	}

	/** The line under an offer, in two pieces around the date, so that the date can be a <time>. */
	export function timesParts(times: Talks['labels']['times'], count: number): [string, string] {
		const template = (count === 1 ? times.one : times.many).replace('{count}', String(count));
		const [before, after = ''] = template.split('{last}');
		return [before, after];
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
	const { labels } = content;
	const given = newestGivenFirst(content.given);
	const offers = new Map(content.offers.map((offer) => [offer.id, offer]));

	interface RowTitle {
		before: string;
		/** The talk of someone else quoted in the title, with the language to mark it with. */
		quote?: { text: string; lang?: Locale };
		after: string;
		/** The language to mark the whole title with. */
		lang?: Locale;
	}

	/** What an occurrence is called: its own title, or the title of the offer it belongs to. */
	function titleOf(talk: TalkGiven): RowTitle {
		if (talk.title !== undefined) {
			const [before, after] = splitTalkTitle(talk.title);
			const quote = talk.talk && {
				text: talk.talk.title,
				lang: foreignTitleLang({ titleLang: talk.talk.lang }, locale)
			};
			return { before, quote: talk.title.includes('{talk}') ? quote : undefined, after };
		}
		const offer = talk.offerId ? offers.get(talk.offerId) : undefined;
		return {
			before: offer?.title ?? '',
			after: '',
			lang: offer && foreignTitleLang(offer, locale)
		};
	}
</script>

<!--
	U7 in two parts under one chip: what is ready to give (the catalogue) and when it was given (the
	history, newest first). The offers are information only: no booking button and no address, on
	either build. How to reach him is in the contact chip.
-->
<Chip id="talks" designator="U7" labelledby="talks-title" side="both">
	<h2 id="talks-title">{content.title}</h2>
	{#if content.intro}
		<p class="intro">{content.intro}</p>
	{/if}

	<div class="part part-offers">
		<h3>{labels.offers}</h3>
		<p class="offers-note">{labels.offersNote}</p>
		<ul class="offers">
			{#each content.offers as offer (offer.id)}
				{@const stats = offerStats(offer.id, content.given)}
				<li class="offer" data-offer={offer.id} data-kind={offer.kind}>
					<p class="kind">{labels.kind[offer.kind]}</p>
					<h4 class="title" lang={foreignTitleLang(offer, locale)}>{offer.title}</h4>
					<p class="summary">{offer.summary}</p>
					<dl class="facts">
						{#each offerFacts(offer, labels, locale) as fact (fact.label)}
							<div>
								<dt>{fact.label}</dt>
								<dd>{fact.value}</dd>
							</div>
						{/each}
					</dl>
					{#if stats.count && stats.last}
						{@const [before, after] = timesParts(labels.times, stats.count)}
						<p class="times">
							{before}<time datetime={stats.last}>{formatDay(stats.last, locale)}</time>{after}
						</p>
					{/if}
				</li>
			{/each}
		</ul>
	</div>

	<div class="part part-given">
		<h3>{labels.given}</h3>
		<ul class="given">
			{#each given as talk (talk.id)}
				{@const title = titleOf(talk)}
				<li data-given={talk.id}>
					<time datetime={talk.date}>{formatDay(talk.date, locale)}</time>
					<span class="what">
						<span class="title" lang={title.lang}
							>{title.before}{#if title.quote}<q lang={title.quote.lang}>{title.quote.text}</q
								>{title.after}{/if}</span
						>
						{#if talk.event || talk.lang}
							<span class="sr-only">, </span>
							<span class="event">
								{#if talk.event && talk.url}
									<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an external address, not a route -->
									<a href={talk.url}
										>{talk.event}<span class="sr-only">{' ' + m.external_site()}</span></a
									>
								{:else if talk.event}
									{talk.event}
								{/if}
								{#if talk.lang}
									<span class="spoken"
										>{#if talk.event}<span class="dot" aria-hidden="true">·</span><span
												class="sr-only"
												>,
											</span>{/if}{labels.language[talk.lang]}</span
									>
								{/if}
							</span>
						{/if}
					</span>
				</li>
			{/each}
		</ul>
	</div>
</Chip>

<style>
	.intro {
		margin-bottom: 0;
		color: var(--ink-muted);
	}

	.part {
		margin-top: 2rem;
	}

	/* A short trace under each heading: the catalogue is the freelance path, the history the job path. */
	.part-offers {
		--part-color: var(--trace-green);
	}

	/* One note for every offer: it follows the heading, the cards follow it. */
	.offers-note {
		margin-bottom: 1rem;
		color: var(--ink-muted);
	}

	.part-given {
		--part-color: var(--trace-cyan);
	}

	h3 {
		position: relative;
		margin-bottom: 1rem;
		padding-bottom: 0.625rem;
	}

	h3::after {
		content: '';
		position: absolute;
		inset: auto 0 0;
		height: 2px;
		background: linear-gradient(90deg, var(--part-color), transparent);
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.offers {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
		gap: 1rem 1.5rem;
	}

	.offer {
		display: flex;
		flex-direction: column;
		min-width: 0;
		padding: 1rem 1.125rem 1.125rem;
		border: 1px solid var(--silk-faint);
		border-radius: 0.25rem;
		--kind-color: var(--trace-cyan);
	}

	.offer[data-kind='workshop'] {
		--kind-color: var(--trace-green);
	}

	.kind {
		margin: 0 0 0.25rem;
		color: var(--kind-color);
		font-family: var(--font-display);
		font-size: 0.8125rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.offer h4 {
		margin: 0 0 0.5rem;
		font-family: var(--font-display);
		font-size: 1.0625rem;
		font-weight: 500;
		line-height: 1.3;
		overflow-wrap: break-word;
		text-wrap: balance;
	}

	.summary {
		margin-bottom: 0.75rem;
		color: var(--ink-muted);
		font-size: var(--text-small);
	}

	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.125rem 1rem;
		margin: 0 0 0.5rem;
		font-size: var(--text-small);
	}

	.facts div {
		display: flex;
		gap: 0.4rem;
	}

	.facts dt {
		color: var(--ink-muted);
	}

	.facts dd {
		margin: 0;
	}

	/* How often it was given sits at the foot of every card, whatever the length of the text above. */
	.times {
		margin: auto 0 0;
		color: var(--ink-muted);
		font-family: var(--font-display);
		font-size: 0.8125rem;
	}

	.given li {
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

	/* Inside the card the date is part of a sentence: it keeps the flow of the line. */
	.times time {
		font-size: inherit;
		line-height: inherit;
	}

	.what {
		min-width: 0;
		overflow-wrap: break-word;
	}

	.event {
		display: block;
		color: var(--ink-muted);
		font-size: var(--text-small);
	}

	/* A dot between the event and the language, with room on both sides. */
	.dot {
		margin-inline: 0.5em;
	}

	/* The date takes a column of its own once there is room for one. */
	@media (min-width: 36rem) {
		.given li {
			grid-template-columns: 7.5rem minmax(0, 1fr);
			align-items: baseline;
		}
	}
</style>
