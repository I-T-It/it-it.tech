<script lang="ts">
	import NotFound from '#lib/components/NotFound.svelte';
</script>

<!--
	Errors raised in the browser: an address the client router has no route for. A static site has
	no server code, so every error here is a missing page. Unknown addresses that load from the
	server get the prerendered 404.html, which is the not-found route below.
-->
<NotFound />
