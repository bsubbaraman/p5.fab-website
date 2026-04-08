<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import { auth, db } from '../dbConfig';
	import { getDoc, doc } from 'firebase/firestore';
	import { store } from '../store/state.svelte.js';
	import { setupMessages } from '$lib/setupMessages.js';

	onMount(() => {
		const unsubscribe = auth.onAuthStateChanged(async (user) => {
			if (!user) {
				return;
			}

			let dataToSetToStore;
			const docRef = doc(db, 'users', user.uid);
			const docSnap = await getDoc(docRef);
			if (!docSnap.exists()) {
				// This shouldn't happen - user doc is created during signup
				console.warn('User doc missing for', user.uid);
				dataToSetToStore = { favorites: [] };
			} else {
				dataToSetToStore = docSnap.data();
			}

			store.user = user;
			store.favorites = dataToSetToStore.favorites;
			store.data = dataToSetToStore;
			store.loading = false;
		});

		setupMessages();
	});
</script>

<slot />
