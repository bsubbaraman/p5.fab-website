<script>
	import Header from '../../../components/Header.svelte';
	import { store } from '../../../store/store';
	import { db, storage } from '../../../dbConfig';
	import { ref, listAll } from 'firebase/storage';
	import { getDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

	let { data } = $props();
	let postData = $state();
	let objectID = $state();
	let docRef = $state();

	async function fetchPostData() {
		// Get info about the Fab
		objectID = data.id;
		docRef = doc(db, 'posts', objectID);
		const docSnap = await getDoc(docRef);

		if (docSnap.exists()) {
			// Load in data
			postData = docSnap.data();
		} else {
			// docSnap.data() will be undefined in this case
			console.log('No such document!');
		}
	}

	function getDate() {
		// Might want to show 'modified' date at some point?
		const createdDate = postData.created.toDate();
		const month = createdDate.toLocaleString('default', { month: 'long' });
		const day = createdDate.getUTCDate();
		const year = createdDate.getFullYear();
		return `${month} ${day} ${year} `;
	}

	async function likePost() {
		if (!$store.user) {
			toggleAuthContainer();
			return;
		}

		var userFavorites = $store.favorites;
		const idx = userFavorites.indexOf(objectID);
		if (idx > -1) {
			userFavorites.splice(idx, 1);
			postData.favorites -= 1;
		} else {
			userFavorites.push(objectID);
			postData.favorites += 1;
		}

		// Update database & store
		await updateDoc(docRef, {
			favorites: postData.favorites
		});

		const userRef = doc(db, 'users', $store.user.uid);
		await updateDoc(userRef, {
			favorites: userFavorites
		});

		$store.favorites = userFavorites;
	}

	function toggleAuthContainer() {
		$store.displayLogin = !$store.displayLogin;
	}

	fetchPostData();
</script>

<Header />
<div class="page-container card">
	{#if postData}
		<div class="fabHeader">
			<h1 class="fabName">{postData.name}</h1>
			<span class="meta">by <a href="/users/{postData.user}">{postData.username}</a></span><br />
			<span class="meta">{getDate()}</span>
		</div>

		<div class="card-content shadow">
			<div class="images">
				<img src={postData.files[0]} />
			</div>
			<div class="community">
				<button onclick={likePost}>
					{#if $store.user && $store.favorites.includes(objectID)}
						<i class="fa-solid fa-heart"></i>
					{:else}
						<i class="fa-regular fa-heart"></i>
					{/if}

					{postData.favorites}
				</button>
				<button>
					<i class="fa-solid fa-code-fork"></i>
					{postData.forks}
				</button>
				<button>
					<i class="fa-solid fa-code"></i>
					Open in editor
				</button>
				<button disabled={postData.fabscription ? false : true}>
					<i class="fa-solid fa-film"></i>
					Open Fabscription
				</button>
			</div>
			<div class="fabInfo">
				<h3>Info</h3>
				{postData.info}
			</div>
			<div class="forks">
				<h3>Forks</h3>
				{#if !postData.forks}
					No forks yet! Wanna make one?
				{:else}
					I'll add thumbnails of the forks here...
				{/if}
			</div>
		</div>
	{:else}
		loading...
	{/if}
</div>

<style>
	.fabName {
		margin-bottom: 10px;
	}

	.meta {
		font-size: 12px;
	}

	.fabHeader {
		margin-bottom: 20px;
	}

	.images {
		width: 100%; /* Set your desired width */
		height: 300px;
		margin-bottom: 20px;
	}

	.images img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.community {
		text-align: center;
	}

	.forks {
	}

	button {
		margin-left: 2px;
		margin-right: 2px;
	}
</style>
