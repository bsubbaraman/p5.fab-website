<script>
	import Share from '../../../components/Share.svelte';
	import Header from '../../../components/Header.svelte';

	let { data } = $props(); // to pass in dynamic parameters, setup in +page.js
</script>

<main>
	<Header />
	<Share />
</main>
