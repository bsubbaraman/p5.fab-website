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

	async function forgotPassword() {
		if (!email) {
			alert('Enter your email above first, then click "Forgot password?" to get a reset link.');
			return;
		}
		try {
			await authHandlers.resetPassword(email);
		} catch (err) {
			console.log('Password reset error', err);
		}
		// Neutral message regardless of outcome — Firebase does not reveal whether
		// an account exists for the address (prevents email enumeration).
		alert('If an account exists for that email, a password reset link is on its way.');
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
		<button onclick={signIn} type="button" class="sign-in">Sign In</button>
		<button onclick={signUp} type="button" class="sign-up">Sign Up</button>
		<button onclick={forgotPassword} type="button" class="forgot">Forgot password?</button>
	</form>
</div>

<style>
	.error {
		font-size: 14px;
		color: black;
		background: red;
		margin-top: 20px;
	}

	.forgot {
		display: block;
		background: none;
		border: none;
		padding: 0;
		margin-top: 12px;
		font-size: 12px;
		color: inherit;
		text-decoration: underline;
		cursor: pointer;
	}
</style>
