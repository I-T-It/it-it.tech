<script lang="ts">
	import { onMount } from 'svelte';
	import { m } from '#lib/paraglide/messages.js';

	/** True once the visitor has scrolled. The pulse stops then and does not come back. */
	let done = $state(false);

	onMount(() => {
		// A reload or a deep link can start the page scrolled: nothing to point at then.
		if (window.scrollY > 0) {
			done = true;
			return;
		}
		const stop = () => (done = true);
		window.addEventListener('scroll', stop, { once: true, passive: true });
		return () => window.removeEventListener('scroll', stop);
	});
</script>

<!--
	A real link to the availability section, so it works without JS and with a keyboard. The trace
	under the label is decoration: a line that runs off the bottom of the hero and ends in a pad,
	with a pulse that runs down it 3 times and then rests. No script drives the pulse, only CSS;
	the script only says that the first scroll happened.
-->
<a class="scroll-indicator" href="#availability" data-done={done ? 'true' : undefined}>
	<span class="label">{m.scroll_continue()}</span>
	<span class="trace" aria-hidden="true">
		<span class="line"><span class="pulse"></span></span>
		<span class="pad"></span>
	</span>
</a>

<style>
	.scroll-indicator {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		min-width: 2.75rem;
		min-height: 2.75rem;
		padding: 0.25rem 0.75rem;
		color: var(--ink);
		font-family: var(--font-display);
		font-size: var(--text-small);
		line-height: 1.4;
		text-decoration: none;
	}

	.label {
		text-decoration: underline;
		text-decoration-color: var(--silk);
		text-decoration-thickness: 1px;
		text-underline-offset: 0.3em;
	}

	@media (hover: hover) {
		.scroll-indicator:hover .label {
			text-decoration-color: var(--ink);
		}
	}

	.trace {
		position: relative;
		display: block;
		width: 2px;
		height: 2.5rem;
		/* The pad hangs below the line, so the whole link stays clear of what follows. */
		margin-bottom: 5px;
	}

	/* The line fades from cyan into green on its way down, like the two traces of the logo. */
	.line {
		position: absolute;
		inset: 0;
		overflow: hidden;
		border-radius: 1px;
		background: linear-gradient(to bottom, var(--trace-cyan), var(--trace-green));
	}

	.pad {
		position: absolute;
		left: 50%;
		bottom: -5px;
		width: 10px;
		height: 10px;
		margin-left: -5px;
		border-radius: 50%;
		background: var(--pad-green);
		box-shadow: 0 0 8px color-mix(in srgb, var(--trace-green) 70%, transparent);
	}

	/* The travelling light. Invisible unless it is animating, so a stopped pulse leaves no mark. */
	.pulse {
		position: absolute;
		left: 0;
		top: 0;
		width: 100%;
		height: 1.25rem;
		background: linear-gradient(to bottom, transparent, var(--ink));
		opacity: 0;
	}

	/*
	 * 3 passes of 1.3 s after a 0.6 s wait: over in 4.5 s, under the 5 s of WCAG 2.2.2, and
	 * one pass is slow enough to stay clear of the flash limit. The first scroll ends it.
	 */
	@media (prefers-reduced-motion: no-preference) {
		:global(html:not(.reduced)) .scroll-indicator:not([data-done]) .pulse {
			animation: travel 1.3s ease-in 0.6s 3 both;
		}
	}

	@keyframes travel {
		from {
			opacity: 0;
			transform: translateY(-100%);
		}
		20% {
			opacity: 1;
		}
		80% {
			opacity: 1;
		}
		to {
			opacity: 0;
			transform: translateY(2.5rem);
		}
	}
</style>
