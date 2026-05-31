<script>
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { store, authHandlers } from '../store/state.svelte.js';
	import { toggleAuthContainer, signOut } from '$lib/events/auth.js';
	import SignIn from './SignIn.svelte';
	import SignUp from './SignUp.svelte';

	let dividerContainer = $state();
	let pathD = $state('');

	const margin = 32;
	const periods = 40;
	const amplitude = 6;
	const centerY = 8;
	const steps = 1000;
	const sigma = 40;
	const extraFactor = 2.5;

	let pointerX = 0;
	let intensity = 0;
	let targetIntensity = 0;
	let lastTs = 0;
	let raf;

	function buildPath() {
		const width = dividerContainer.clientWidth - 2 * margin;
		const pts = Array.from({ length: steps + 1 }, (_, i) => {
			const x = margin + (i / steps) * width;
			const dx = x - pointerX;
			const env = 1 + extraFactor * intensity * Math.exp(-(dx * dx) / (2 * sigma * sigma));
			const y = centerY + amplitude * env * Math.sin((i / steps) * periods * 2 * Math.PI);
			return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`;
		});
		return pts.join(' ');
	}

	function frame(ts) {
		const dt = lastTs ? (ts - lastTs) / 1000 : 0;
		lastTs = ts;
		intensity += (targetIntensity - intensity) * Math.min(1, 8 * dt);
		pathD = buildPath();
		raf = requestAnimationFrame(frame);
	}

	function handlePointerMove(e) {
		pointerX = e.clientX - dividerContainer.getBoundingClientRect().left;
		targetIntensity = 1;
	}

	function handlePointerLeave() {
		targetIntensity = 0;
	}

	onMount(() => {
		raf = requestAnimationFrame(frame);
		return () => cancelAnimationFrame(raf);
	});
</script>

<header>
	<div class="nav-bar">
		<div class="nav-left">
			<a class="logo" href="/explore"> <i>p5.fab</i></a>
		</div>

		<div class="nav-right">
			<div class="menu-item">
				<a href="/explore" class:active={page.url.pathname == '/explore'}>Explore</a>
			</div>
			<div class="menu-item">
				<a href="/sketch/new" class:active={page.url.pathname == '/create'}>Create</a>
			</div>
			<div class="menu-item">
				<a href="https://machineagency.github.io/p5.fab-docs/" target="_blank">Docs</a>
			</div>
			<div class="menu-item">
				<a href="/about" class:active={page.url.pathname == '/about'}>About</a>
			</div>
			{#if !store.user}
				<div class="menu-item">
					<button class="sign-in-btn" onclick={toggleAuthContainer}>Sign In</button>
				</div>
			{:else}
				<div class="menu-item">
					<div class="dropdown">
						<a href="/users/{store.user.uid}" class="profile">Profile</a>
						<div class="dropdown-content">
							<button onclick={signOut} class="dropdownBtn">Sign Out</button>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
	<div
		class="wave-divider"
		bind:this={dividerContainer}
		onpointermove={handlePointerMove}
		onpointerleave={handlePointerLeave}
	>
		{#if pathD}
			<svg width="100%" height="20" style="overflow: visible">
				<path
					d={pathD}
					stroke="black"
					fill="none"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		{/if}
	</div>
</header>

{#if !store.user && store.displayLogin}
	{#if store.displaySignUp}
		<SignUp />
	{:else}
		<SignIn />
	{/if}
{/if}

<style>
	.nav-bar {
		display: flex;
		justify-content: space-between;
		left: 0px;
		top: 0px;
		right: 0px;
		height: 10vh;
		min-height: 1.75em;
	}

	.nav-left {
		display: flex;
		align-items: center;
		margin-left: 10px;
	}

	.nav-right {
		display: flex;
		align-items: center;
		text-align: center;
		position: relative;
		margin-right: 10px;
	}

	.menu-item {
		cursor: pointer;
		padding: 3px 10px;
		vertical-align: right;
		display: inline;
		border-radius: 5px;
		position: relative;
		font-size: 1.25em;
	}

	.logo {
		background-color: #ff6700;
		color: black;
		text-decoration: none;
		font-size: 1.5em;
		font-family: Roboto Mono;
		padding: 3px;
		margin-left: 20px;
	}

	.dropdown {
		position: relative;
		display: inline-block;
	}

	.dropdown-content {
		visibility: hidden;
		display: block;
		position: absolute;
		right: 0;
		top: 1.5em;
		background-color: var(--nord5);
		min-width: 100px;
		box-shadow: 0px 8px 16px 0px rgba(0, 0, 0, 0.2);
		z-index: 1;
	}

	.dropdown-content:hover {
		visibility: visible;
	}

	.profile {
		padding-bottom: 10px;
	}

	.profile:hover + .dropdown-content {
		visibility: visible;
	}

	.dropdownBtn {
		width: 100%;
		background: none;
		border: none;
		font-size: 0.8em;
		padding: 10px 4px;
		text-decoration: none;
		display: block;
		padding-left: 10px;
		padding-right: 10px;
		cursor: pointer;
		font-family: 'Inter', sans-serif;
		text-align: center;
		letter-spacing: normal;
	}

	.dropdownBtn:hover {
		color: var(--white);
		background-color: var(--nord3);
	}

	.wave-divider {
		width: 100%;
		line-height: 0;
	}

	.sign-in-btn {
		background: none;
		border: none;
		font-size: 1em;
		font-family: 'Inter', sans-serif;
		padding: 0;
		cursor: pointer;
	}

	.sign-in-btn:hover {
		background: none;
		text-decoration: underline;
		text-decoration-color: var(--ma-orange);
		text-decoration-thickness: 3px;
	}
</style>
