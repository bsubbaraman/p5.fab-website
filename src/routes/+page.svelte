<script>
	import Hero from '../components/Hero.svelte';
	import Gallery from '../components/Gallery.svelte';
	import Header from '../components/Header.svelte';
	import SignIn from '../components/SignIn.svelte';
	import { store } from '../store/state.svelte.js';
	import { onMount } from 'svelte';

	onMount(() => {
		window.location.href = '/explore';
	});
</script>

<main>
	<!-- Could change this to be a landing page later -->
	<!-- <Hero /> -->
	<Header />
	<Gallery />
</main>
