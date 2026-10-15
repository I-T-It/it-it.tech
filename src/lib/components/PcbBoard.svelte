<!--
	Stub. S5 replaces this with the real board: renderer, runtime, scroll growth and pulses.
	The contract stays: one fixed canvas behind the content, aria-hidden, no pointer events,
	and data-pcb-state on the canvas.
-->
<canvas class="pcb-board" aria-hidden="true" data-pcb-state="stub"></canvas>

<style>
	.pcb-board {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: -1;
	}
</style>
