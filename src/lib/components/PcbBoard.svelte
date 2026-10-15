<script lang="ts">
	import { onMount } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { BoardRuntime } from '#lib/pcb/runtime.svelte.js';

	// The canvas exists only once scripts run: without JS there is no board, only the CSS
	// gradient behind readable content.
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});

	const board: Attachment<HTMLCanvasElement> = (canvas) => {
		const runtime = new BoardRuntime(canvas);
		void runtime.start();
		return () => runtime.destroy();
	};
</script>

<!--
	The board is decoration: hidden from screen readers, never focusable, and it takes no pointer
	events, so everything under it stays clickable. The runtime writes data-pcb-state on it.
-->
{#if mounted}
	<canvas class="pcb-board" aria-hidden="true" {@attach board}></canvas>
{/if}

<style>
	.pcb-board {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: -1;
	}

	@media print {
		.pcb-board {
			display: none;
		}
	}
</style>
