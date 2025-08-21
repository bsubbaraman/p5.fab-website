<script>
	import { page } from '$app/state';
	import { store, authHandlers } from '../store/state.svelte.js';
	import { toggleAuthContainer, signOut } from '$lib/events/auth.js';
	import SignIn from './SignIn.svelte';
	import SignUp from './SignUp.svelte';
</script>

<header>
	<div class="nav-bar">
		<div class="nav-left">
			<a class="logo" href="/explore"> p5.fab </a>
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

			{#if store.user}
				<div class="menu-item">
					<div class="dropdown">
						<a href="/share" class:active={page.url.pathname == '/share'}>Share</a>
					</div>
				</div>
			{/if}
			<div class="menu-item">
				<a>About</a>
			</div>
			{#if !store.user}
				<div class="menu-item">
					<a onclick={toggleAuthContainer}>Sign In</a>
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
		border-bottom: 1px solid black;
		/* box-shadow: 0 1px 3px 0 grey; */
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
</style>
