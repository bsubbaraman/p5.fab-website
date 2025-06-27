<script>
	import '../app.css';
	import Footer from '../components/Footer.svelte';
	import { onMount } from 'svelte';
	import { auth, db } from '../dbConfig';
	import { getDoc, doc, setDoc } from 'firebase/firestore';
	import { store } from '../store/store';

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
			console.log('favorites', dataToSetToStore.favorites);
			store.update((curr) => {
				return {
					...curr,
					user,
					favorites: dataToSetToStore.favorites,
					data: dataToSetToStore,
					loading: false
				};
			});
		});
	});
</script>

<slot />
<Footer />

<!-- header
hero
gallery
footer -->
