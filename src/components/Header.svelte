<script>
	import { page } from '$app/state';
	import SignIn from './SignIn.svelte';
	import { store } from '../store/store';
	import { authHandlers } from '../store/store';
	import SignUp from './SignUp.svelte';

	let authenticating = false;

	function toggleAuthContainer() {
		$store.displayLogin = !$store.displayLogin;
	}

	async function handleAuthentication() {
		console.log('click');
		if (authenticating) {
			return;
		}
		try {
			await authHandlers.logout();
		} catch (err) {
			console.log('Authentication error', err);
		}
		authenticating = true;
		$store.user = null;
		$store.displayLogin = false;
		$store.displaySignUp = false;
	}
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
				<a href="https://machineagency.github.io/p5.fab-docs/" target="_blank">Docs</a>
			</div>
			<div class="menu-item">
				<a>About</a>
			</div>
			{#if !$store.user}
				<div class="menu-item">
					<a on:click={toggleAuthContainer}>Sign In</a>
				</div>
			{:else}
				<div class="menu-item">
					<div class="dropdown">
						<a href="/share" class:active={page.url.pathname == '/share'}>Share</a>
					</div>
				</div>
				<div class="menu-item">
					<div class="dropdown">
						<a href="/users/{$store.user.uid}" class="profile">Profile</a>
						<div class="dropdown-content">
							<a on:click={handleAuthentication}>Sign Out</a>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
</header>

{#if !$store.user && $store.displayLogin}
	{#if $store.displaySignUp}
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
		box-shadow: 0 1px 3px 0 grey;
	}

	.nav-text {
		left: 0px;
		right: 0px;
		z-index: 0;
		margin-top: 0px;
		margin-bottom: 0px;

		font-size: 19px;
		line-height: 0px;
		font-weight: 400;
		text-align: center;
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

	.dropdown-content {
		visibility: hidden;
		display: block;
		position: absolute;
		background-color: #f9f9f9;
		width: 150%;
		height: 150%;
		z-index: 1;
		padding: 10px;
		top: 30px;
		right: 5%;
		overflow-y: hidden;
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
</style>
