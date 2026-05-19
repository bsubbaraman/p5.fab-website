<script>
	import { getFunctions, httpsCallable } from 'firebase/functions';
	import { deleteUser } from 'firebase/auth';
	import { deleteDoc, doc } from 'firebase/firestore';
	import { store, authHandlers } from '../store/state.svelte.js';
	import { toggleAuthContainer } from '$lib/events/auth.js';
	import { db } from '../dbConfig';

	let email = $state('');
	let username = $state('');
	let password = $state('');
	let authenticating = false;

	async function signUp() {
		if (authenticating) return;
		authenticating = true;
		let newUser = null;
		try {
			// Create auth user and user doc
			newUser = await authHandlers.signup(email, password, username);

			// Atomically claim the username via Cloud Function
			const functions = getFunctions();
			const claimUsername = httpsCallable(functions, 'claimUsername');
			await claimUsername({ username });

			toggleAuthContainer();
		} catch (err) {
			// If username claim failed, roll back the auth user and user doc
			if (newUser) {
				await deleteDoc(doc(db, 'users', newUser.uid));
				await deleteUser(newUser);
			}
			if (err.code === 'functions/already-exists') {
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
		<button onclick={signUp} type="button" class="sign-up" disabled={disableSignUp}>Sign Up</button>
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
