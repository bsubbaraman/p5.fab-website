<script>
	import { store, authHandlers } from '../store/state.svelte.js';
	import { toggleAuthContainer } from '$lib/events/auth.js';
	let email = '';
	let password = '';
	let authenticating = false;

	function signUp() {
		store.displaySignUp = true;
	}

	async function signIn() {
		if (authenticating) {
			return;
		}
		try {
			await authHandlers.login(email, password);
		} catch (err) {
			console.log('Authentication error', err);
			alert(err);
		}
		// authenticating = true;
	}
</script>

<div class="auth-container">
	<button aria-label="Close" onclick={toggleAuthContainer} class="close">
		<i class="fa-solid fa-x"></i>
	</button>
	<form>
		<label>
			<input bind:value={email} class="input" type="email" placeholder="email" />
		</label>
		<label>
			<input bind:value={password} class="input" type="password" placeholder="password" />
		</label>
		<button onclick={signIn} type="submit" class="sign-in">Sign In</button>
		<button onclick={signUp} type="submit" class="sign-up">Sign Up</button>
	</form>
</div>

<style>
	.error {
		font-size: 14px;
		color: black;
		background: red;
		margin-top: 20px;
	}
</style>
