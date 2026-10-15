<script lang="ts">
	import { getContent } from '#lib/content/index.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import Chip from '#lib/components/Chip.svelte';

	const about = getContent(getLocale()).about;
</script>

<!-- U3. The first paragraph is the statement; the others stand beside it on a wide window. -->
<Chip id="about" designator="U3" side="both" labelledby="about-title">
	<h2 id="about-title">{about.title}</h2>
	<div class="text">
		{#each about.paragraphs as paragraph (paragraph)}
			<p>{paragraph}</p>
		{/each}
	</div>
</Chip>

<style>
	.text p {
		color: var(--ink-muted);
	}

	.text p:last-child {
		margin-bottom: 0;
	}

	/* The statement. Set larger and in full white, so the page says who this is at a glance. */
	.text p:first-child {
		color: var(--ink);
		font-size: clamp(1.25rem, 2.4vw, 1.5rem);
		font-weight: 500;
		line-height: 1.4;
		text-wrap: balance;
	}

	@media (min-width: 52rem) {
		.text {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			column-gap: clamp(2rem, 5vw, 3.5rem);
			align-items: start;
		}

		.text p:first-child {
			grid-row: 1 / span 2;
			margin-bottom: 0;
		}
	}
</style>
