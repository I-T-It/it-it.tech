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
		/**
		 * Light the LEDs one after another, once, when a parent sets `data-lit` on itself (the Skills
		 * group does it as it scrolls into view). Until then they wait, dark. The parent never takes
		 * the attribute away again, so the row does not replay. Without JS and under reduced motion
		 * the LEDs are simply lit.
		 */
		sequence?: boolean;
	}

	let { level, max = 5, text, sequence = false }: Props = $props();

	const lit = $derived(Math.min(max, Math.max(0, Math.round(level))));
</script>

<!--
	The LED row is visual only. The visually hidden text next to it is the accessible equivalent,
	so the level never depends on colour or shape alone.
-->
<span class="leds" data-sequence={sequence}>
	<span class="leds-visual" aria-hidden="true">
		{#each { length: max }, i (i)}
			<span class="led" data-lit={i < lit} style:--i={i}></span>
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
		/* The wait between one LED and the next, in a sequence. 5 LEDs take 0.56 s to light. */
		--led-step: 140ms;
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
		transition:
			border-color 0.3s ease,
			background-color 0.3s ease,
			box-shadow 0.3s ease;
	}

	.led[data-lit='true'] {
		border-color: var(--led);
		background: var(--led);
		box-shadow: 0 0 6px color-mix(in srgb, var(--led) 65%, transparent);
	}

	/*
	 * A sequence waits, dark, while JS is on and motion is allowed (html.js:not(.reduced), set by
	 * the inline script before the first paint), until an ancestor says data-lit. Without JS or
	 * under reduced motion neither rule applies and the LEDs are lit like any other row.
	 */
	:global(html.js:not(.reduced)) .leds[data-sequence='true'] .led[data-lit='true'] {
		border-color: var(--silk);
		background: transparent;
		box-shadow: none;
	}

	:global(html.js:not(.reduced) [data-lit]) .leds[data-sequence='true'] .led[data-lit='true'] {
		border-color: var(--led);
		background: var(--led);
		box-shadow: 0 0 6px color-mix(in srgb, var(--led) 65%, transparent);
		transition-delay: calc(var(--i) * var(--led-step));
	}

	@media (prefers-reduced-motion: reduce) {
		.led {
			transition: none;
		}
	}

	:global(html.reduced) .led {
		transition: none;
	}
</style>
