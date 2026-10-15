<script lang="ts">
	import { getContent } from '#lib/content/index.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import Chip from '#lib/components/Chip.svelte';

	const competences = getContent(getLocale()).competences;
</script>

<!-- U4. The competences, 2 by 2 on a wide window, laid out like the cells of a datasheet table. -->
<Chip id="competences" designator="U4" side="both" labelledby="competences-title">
	<h2 id="competences-title">{competences.title}</h2>
	{#if competences.intro}
		<p class="intro">{competences.intro}</p>
	{/if}
	<div class="grid">
		{#each competences.items as item (item.id)}
			<div class="item">
				<h3>{item.title}</h3>
				<p>{item.text}</p>
			</div>
		{/each}
	</div>
</Chip>

<style>
	.intro {
		color: var(--ink-muted);
	}

	/* The gap between the cells shows the hairline colour behind them. */
	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1px;
		margin-top: 1.25rem;
		border: 1px solid var(--silk-faint);
		background: var(--silk-faint);
	}

	@media (min-width: 48rem) {
		.grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	.item {
		padding: 1.25rem clamp(1rem, 4vw, 1.5rem);
		background: var(--chip-fill);
	}

	/*
	 * A pad before each title: cyan in the left column, green in the right one. A long title
	 * ("Multidisciplinair") wraps inside the cell on a narrow window and under the text spacing
	 * overrides (1.4.12), instead of running out of it.
	 */
	h3 {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		font-size: var(--text-h3);
		overflow-wrap: anywhere;
		hyphens: auto;
	}

	h3::before {
		content: '';
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--pad-cyan);
		box-shadow: 0 0 6px color-mix(in srgb, var(--trace-cyan) 60%, transparent);
	}

	.item:nth-child(even) h3::before {
		background: var(--pad-green);
		box-shadow: 0 0 6px color-mix(in srgb, var(--trace-green) 60%, transparent);
	}

	.item p {
		margin-bottom: 0;
		color: var(--ink-muted);
	}
</style>
