<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import { auth, db } from '../dbConfig';
	import { getDoc, doc, setDoc } from 'firebase/firestore';
	import { store } from '../store/state.svelte.js';
	import { setupMessages } from '$lib/setupMessages.js';

	async function getAllPostsData() {
		const allPostsRef = doc(db, 'posts', 'allPosts');
		const allPostsSnap = await getDoc(allPostsRef);

		if (allPostsSnap.exists()) {
			store.allPostsData = allPostsSnap.data();
		} else {
			console.log('No such document!');
		}
	}
	onMount(() => {
		console.log('Mounting');
		const unsubscribe = auth.onAuthStateChanged(async (user) => {
			console.log('AuthStateChange');
			if (!user) {
				return;
			}

			let dataToSetToStore;
			const docRef = doc(db, 'users', user.uid);
			const docSnap = await getDoc(docRef);
			if (!docSnap.exists()) {
				// This... shouldn't happen?
				const userRef = doc(db, 'users', user.uid);
				dataToSetToStore = {
					email: user.email
				};
				await setDoc(userRef, dataToSetToStore, { merge: true });
			} else {
				const userData = docSnap.data();
				dataToSetToStore = userData;
			}

			store.user = user;
			store.favorites = dataToSetToStore.favorites;
			store.data = dataToSetToStore;
			store.loading = false;
		});

		setupMessages();
		getAllPostsData();
	});
</script>

<slot />
