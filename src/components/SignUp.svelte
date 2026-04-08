<script>
	import { getFunctions, httpsCallable } from 'firebase/functions';
	import { deleteUser } from 'firebase/auth';
	import { store, authHandlers } from '../store/state.svelte.js';
	import { toggleAuthContainer } from '$lib/events/auth.js';

	let email = $state('');
	let username = $state('');
	let password = $state('');
	let authenticating = false;

	async function signUp() {
		if (authenticating) return;
		authenticating = true;
		let newUser = null;
		try {
			// Create the Firebase Auth user first
			newUser = await authHandlers.signup(email, password);

			// Atomically claim username and create user doc via Cloud Function
			const functions = getFunctions();
			const claimUsername = httpsCallable(functions, 'claimUsername');
			await claimUsername({ username, email });

			toggleAuthContainer();
		} catch (err) {
			// If username claim failed, delete the auth user we just created
			if (newUser) {
				await deleteUser(newUser);
			}
			if (err.code === 'already-exists') {
				alert('Username is taken — please choose another.');
			} else if (err.code === 'auth/email-already-in-use') {
				alert('An account with that email already exists.');
			} else {
				alert(err.message);
			}
		} finally {
			authenticating = false;
		}
	}

	// can only sign up if all our checks pass
	let formValidation = $state({
		email: '',
		username: '',
		password: ''
	});
	let disableSignUp = $state(true);

	$effect(() => {
		disableSignUp = true;
		if (email && !email.includes('@')) {
			formValidation.email = 'enter a valid email';
		} else {
			formValidation.email = '';
		}

		// TODO: Check if username is taken
		// if (username && ) {
		// }

		if (password && password.length < 6) {
			formValidation.password = 'pasword must be at least 6 characters';
		} else {
			formValidation.password = '';
		}

		// Some inputs + no errors = good to go!
		if (email && username && password && !Object.values(formValidation).some(Boolean)) {
			disableSignUp = false;
		}
	});
</script>

<div class="auth-container">
	<button aria-label="Close" onclick={toggleAuthContainer} class="close">
		<i class="fa-solid fa-x"></i>
	</button>
	<form>
		<span class="error">{formValidation.email}</span>
		<label>
			<input bind:value={email} class="input" type="email" placeholder="email" />
		</label>
		<span class="error">{formValidation.username}</span>
		<label>
			<input bind:value={username} class="input" type="username" placeholder="username" />
		</label>
		<span class="error">{formValidation.password}</span>
		<label>
			<input bind:value={password} class="input" type="password" placeholder="password" />
		</label>
		<button onclick={signUp} type="submit" class="sign-up" disabled={disableSignUp}>Sign Up</button>
	</form>
</div>

<style>
	.error {
		font-size: 12px;
		color: black;
		/* background: red; */
		/* margin-top: 20px; */
	}
</style>
