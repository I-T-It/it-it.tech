<script lang="ts">
	interface Props {
		/** Lit LEDs. Rounded and clamped to 0..max. */
		level: number;
		max?: number;
		/**
		 * What a screen reader reads instead of the LEDs, e.g. "niveau 4 van 5, 8 jaar". The caller
		 * writes it from the message strings; this component holds no copy.
		 */
		text: string;
	}

	let { level, max = 5, text }: Props = $props();

	const lit = $derived(Math.min(max, Math.max(0, Math.round(level))));
</script>

<!--
	The LED row is visual only. The visually hidden text next to it is the accessible equivalent,
	so the level never depends on colour or shape alone.
-->
<span class="leds">
	<span class="leds-visual" aria-hidden="true">
		{#each { length: max }, i (i)}
			<span class="led" data-lit={i < lit}></span>
		{/each}
	</span>
	<span class="sr-only">{text}</span>
</span>

<style>
	.leds {
		display: inline-flex;
		align-items: center;
		/* The colour follows the section: set --led-color on a parent to change it. */
		--led: var(--led-color, var(--trace-cyan));
	}

	.leds-visual {
		display: inline-flex;
		gap: 0.3rem;
	}

	.led {
		width: 0.625rem;
		height: 0.625rem;
		border: 1px solid var(--silk);
		border-radius: 50%;
		background: transparent;
	}

	.led[data-lit='true'] {
		border-color: var(--led);
		background: var(--led);
		box-shadow: 0 0 6px color-mix(in srgb, var(--led) 65%, transparent);
	}
</style>
