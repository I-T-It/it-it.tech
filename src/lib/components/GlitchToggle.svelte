<script lang="ts">
	import { onMount } from 'svelte';
	import { glitch, setPaused, trackReducedMotion } from '#lib/glitch/state.svelte.js';
	import { m } from '#lib/paraglide/messages.js';

	onMount(() => trackReducedMotion());
</script>

<!--
	The stop switch for the photo glitch (WCAG 2.2.2). It exists only once the glitch has started
	and only while motion is allowed: with no scripts or reduced motion there is nothing to stop.
	A real button; aria-pressed says whether the glitch is stopped, and the name never changes.
	Its look, a small DIP switch with an LED on the corner pad of the photo's footprint, is decoration
	and stays out of the accessibility tree. It sits in the socket, outside the die, which clips.
-->
{#if glitch.armed && !glitch.reduced}
	<button
		type="button"
		class="glitch-toggle"
		aria-pressed={glitch.paused}
		onclick={() => setPaused(!glitch.paused)}
	>
		<span class="sr-only">{m.photo_glitch_pause()}</span>
		<span class="switch" aria-hidden="true"><span class="lever"></span></span>
		<span class="led" aria-hidden="true"></span>
	</button>
{/if}

<style>
	/* Centred on the corner pad: half a cell (a 22nd of the socket) in from the corner each way. */
	.glitch-toggle {
		position: absolute;
		right: calc(100% / 22);
		bottom: calc(100% / 22);
		translate: 50% 50%;
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		padding: 0;
		border: 1px solid var(--silk);
		border-radius: 4px;
		background: var(--board-navy);
		color: var(--ink);
		cursor: pointer;
		animation: toggle-in 0.6s ease-out backwards;
	}

	@media (hover: hover) {
		.glitch-toggle:hover {
			border-color: var(--ink);
		}
	}

	/* A DIP switch: a slot with a lever, up while the glitch runs and down once it is stopped. */
	.switch {
		position: relative;
		width: 0.625rem;
		height: 1rem;
		border: 1px solid var(--silk);
		border-radius: 2px;
	}

	.lever {
		position: absolute;
		left: 1px;
		right: 1px;
		top: 1px;
		height: 0.375rem;
		border-radius: 1px;
		background: var(--ink);
	}

	.glitch-toggle[aria-pressed='true'] .lever {
		top: calc(100% - 0.375rem - 1px);
		background: var(--ink-muted);
	}

	/* The LED in the corner: green while the glitch runs, an empty ring once it is stopped. */
	.led {
		position: absolute;
		top: 3px;
		right: 3px;
		width: 0.3125rem;
		height: 0.3125rem;
		border-radius: 50%;
		background: var(--trace-green);
		box-shadow: 0 0 5px color-mix(in srgb, var(--trace-green) 70%, transparent);
	}

	.glitch-toggle[aria-pressed='true'] .led {
		background: transparent;
		box-shadow: inset 0 0 0 1px var(--silk);
	}

	@keyframes toggle-in {
		from {
			opacity: 0;
		}
	}

	@media print {
		.glitch-toggle {
			display: none;
		}
	}
</style>
