<script>
	import { getDoc, doc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
	import { store, authHandlers } from '../store/store';
	import { db } from '../dbConfig';

	let email = $state('');
	let username = $state('');
	let password = $state('');
	let authenticating = false;

	function toggleAuthContainer() {
		$store.displayLogin = !$store.displayLogin;
		$store.displaySignUp = false;
	}

	async function handleAuthentication() {
		if (authenticating) {
			return;
		}
		try {
			// Check if username is taken
			const docRef = doc(db, 'users', 'usernames');
			const docSnap = await getDoc(docRef);
			if (docSnap.exists()) {
				const data = docSnap.data();
				if (data.allUsernames.includes(username)) {
					alert('username taken!');
					return;
				}
			}
			await authHandlers.signup(email, password, username);
			await updateDoc(doc(db, 'users', 'usernames'), {
				allUsernames: arrayUnion(username)
			});
		} catch (err) {
			console.log('Authentication error', err);
			alert(err);
			// if (err.code === 'auth/email-already-in-use') {
			// 	alert('email already in use!');
			// }
		}
		authenticating = true;
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
	<button on:click={toggleAuthContainer} class="close">
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
		<button on:click={handleAuthentication} type="submit" class="sign-up" disabled={disableSignUp}
			>Sign Up</button
		>
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
