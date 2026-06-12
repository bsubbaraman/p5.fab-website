<script>
	import { getDoc, doc } from 'firebase/firestore';
	import { authHandlers } from '../store/state.svelte.js';
	import { toggleAuthContainer } from '$lib/events/auth.js';
	import { db } from '../dbConfig';

	let email = $state('');
	let username = $state('');
	let password = $state('');
	let authenticating = false;

	async function signUp() {
		if (authenticating) return;
		authenticating = true;
		try {
			// Claims the username + creates the auth user and user doc (rollback handled inside).
			await authHandlers.signup(email, password, username);
			toggleAuthContainer();
		} catch (err) {
			if (err.message === 'username-taken') {
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

	// Username format + availability (debounced). Owns formValidation.username.
	$effect(() => {
		const u = username.trim();
		if (!u) {
			formValidation.username = '';
			return;
		}
		if (!/^[a-zA-Z0-9_]{3,30}$/.test(u)) {
			formValidation.username = '3–30 letters, numbers, or underscore';
			return;
		}
		formValidation.username = '';
		let cancelled = false;
		const timer = setTimeout(async () => {
			const snap = await getDoc(doc(db, 'usernames', u.toLowerCase()));
			if (!cancelled) formValidation.username = snap.exists() ? 'username is taken' : '';
		}, 400);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
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
