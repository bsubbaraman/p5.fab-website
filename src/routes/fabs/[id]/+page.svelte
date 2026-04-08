<script>
	import Header from '../../../components/Header.svelte';
	import { store } from '../../../store/state.svelte.js';
	import { db } from '../../../dbConfig';
	import { getDoc, doc, updateDoc, deleteDoc, increment, arrayRemove } from 'firebase/firestore';
	import { ref, listAll, deleteObject } from 'firebase/storage';
	import { storage } from '../../../dbConfig';
	import { toggleAuthContainer } from '$lib/events/auth';
	import { getPostFromDB } from '$lib/dbLoadSave';
	import ImageGallery from '../../../components/ImageGallery.svelte';
	import RemixPane from '../../../components/RemixPane.svelte';
	import Share from '../../../components/Share.svelte';

	let { data } = $props();
	let postData = $state();
	let objectID = $state();
	let docRef = $state();
	let parentData = $state();
	let forkData = $state({});
	let galleryIndex = $state(0);
	let displayShareScreen = $state(false);

	async function fetchPostData() {
		objectID = data.id;
		postData = await getPostFromDB(objectID);
		docRef = doc(db, 'posts', objectID);

		if (postData.isFork && postData.parentSketch) {
			parentData = await getPostFromDB(postData.parentSketch);
		}

		if (postData.numForks) {
			const forkEntries = (await Promise.all(
				Object.values(postData.forks).map(async (fork) => {
					const fd = await getPostFromDB(fork.objectID);
					if (!fd) return null;
					return [fork.objectID, { ...fd, authorUID: fork.authorUID, username: fork.username }];
				})
			)).filter(Boolean);
			forkData = Object.fromEntries(forkEntries);
		}
	}

	function getDate() {
		// TODO: Might want to show 'modified' date at some point?
		const createdDate = postData.created.toDate();
		const month = createdDate.toLocaleString('default', { month: 'long' });
		const day = createdDate.getUTCDate();
		const year = createdDate.getFullYear();
		return `${month} ${day} ${year} `;
	}

	async function likePost() {
		if (!store.user) {
			toggleAuthContainer();
			return;
		}

		var userFavorites = store.favorites;
		const idx = userFavorites.indexOf(objectID);
		var counter;
		if (idx > -1) {
			userFavorites.splice(idx, 1);
			counter = -1;
			// postData.favorites -= 1;
		} else {
			userFavorites.push(objectID);
			counter = 1;
			// postData.favorites += 1;
		}

		// Update database & store
		await updateDoc(docRef, {
			favorites: increment(counter)
		});

		const userRef = doc(db, 'users', store.user.uid);
		await updateDoc(userRef, {
			favorites: userFavorites
		});

		store.favorites = userFavorites;
		postData.favorites += counter; // so the page displays correct value, but don't send to db
	}

	function toggleShareScreen() {
		displayShareScreen = !displayShareScreen;
	}

	async function deletePost() {
		if (!confirm('Delete this post? This cannot be undone.')) return;
		// Delete all storage files
		const storageFolder = ref(storage, objectID);
		const listed = await listAll(storageFolder);
		await Promise.all(listed.items.map((item) => deleteObject(item)));
		// Remove post ID from user's posts array
		const userRef = doc(db, 'users', store.user.uid);
		await updateDoc(userRef, { posts: arrayRemove(objectID) });
		// Delete the post document
		await deleteDoc(docRef);
		window.location.href = '/explore';
	}

	fetchPostData();
</script>

<main>
	<Header />
	<div class="page-container card">
		{#if displayShareScreen}
			<Share bind:displayShareScreen {postData} {objectID} onSaved={fetchPostData} />
		{:else if postData}
			<div class="fabHeader">
				<h1 class="fabName">{postData.name}</h1>
				<span class="meta"
					>by <b><a href="/users/{postData.authorUID}">{postData.username}</a></b></span
				><br />
				{#if postData.isFork && parentData}
					<span class="meta"
						>remix of <b
							><a data-sveltekit-reload href="/fabs/{postData.parentSketch}"
								>{parentData.name}</a
							></b
						></span
					><br />
				{/if}
				<span class="meta">{getDate()}</span>
				{#if store.user && store.user.uid == postData.authorUID}
					<br />
					<span class="meta edit" onclick={toggleShareScreen}><b>edit</b></span>
					&nbsp;·&nbsp;
					<span class="meta edit delete" onclick={deletePost}><b>delete</b></span>
				{/if}
			</div>

			<div class="card-content">
				<div class="images">
					<!-- <img alt="Contributed project" src={postData.files[0]} /> -->
					<ImageGallery bind:current={galleryIndex} images={postData.files} />
				</div>
				<div class="community">
					<button onclick={likePost}>
						{#if store.user && store.favorites.includes(objectID)}
							<i class="fa-solid fa-heart"></i>
						{:else}
							<i class="fa-regular fa-heart"></i>
						{/if}
						{postData.favorites}
					</button>
					<button>
						<i class="fa-solid fa-code-fork"></i>
						{postData.numForks}
					</button>
					<a href="/sketch/{objectID}">
						<button>
							<i class="fa-solid fa-code"></i>
							Open in editor
						</button>
					</a>
					<a href="/timeline/{objectID}">
						<button disabled={postData.projectLog ? false : true}>
							<i class="fa-solid fa-film"></i>
							Open Timeline
						</button>
					</a>
					<!-- <button disabled={postData.fabscription ? false : true}>
						<i class="fa-solid fa-film"></i>
						Open Fabscription
					</button> -->
				</div>
				<div class="fabInfo">
					<h3>Info</h3>
					{#if postData.materials}
						<b>Material:</b>
						{#each postData.materials as mat, i}
							{postData.materials[i]}
						{/each}
						<br /><br />
					{/if}
					{postData.info}
				</div>
				{#if postData.isFork && parentData}
					<h3>Remixed from</h3>
					<div class="remix-grid">
						<div class="project-tile {parentData.isFork ? 'shadowRemix' : 'shadow'}">
							<a
								aria-label="Project page"
								data-sveltekit-reload
								href="/fabs/{postData.parentSketch}"
							>
								<div class="project-photo-container">
									<img
										alt="Contributed project"
										class="project-photo padding-bottom-std"
										src={parentData.thumbnail ?? parentData.files?.[0]}
									/>
									{#if parentData.isFork}
										<div class="overlayText">Fork</div>
									{/if}
								</div>
							</a>
							<a data-sveltekit-reload href="/fabs/{postData.parentSketch}">
								<div class="project-title padding-bottom-half">{parentData.name}</div>
							</a>
							<div class="author padding-bottom-std">
								by <a href="/users/{postData.parentAuthor}">{parentData.username}</a>
							</div>
						</div>
					</div>
				{/if}
				<div class="forks">
					<h3>Forks</h3>
					{#if !postData.numForks}
						No forks yet! Wanna make one?
					{:else}
						<div class="remix-grid">
							{#each Object.entries(forkData) as [forkID, fd]}
								<div class="project-tile shadowRemix">
									<a
										aria-label="Project page"
										data-sveltekit-reload
										href="/fabs/{forkID}"
									>
										<div class="project-photo-container">
											<img
												alt="Contributed project"
												class="project-photo padding-bottom-std"
												src={fd.thumbnail ?? fd.files?.[0]}
											/>
											<div class="overlayText">Fork</div>
										</div>
									</a>
									<a data-sveltekit-reload href="/fabs/{forkID}">
										<div class="project-title padding-bottom-half">{fd.name}</div>
									</a>
									<div class="author padding-bottom-std">
										by <a href="/users/{fd.authorUID}">{fd.username}</a>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
			<!-- {#if postData.isFork || postData.forks}
				<RemixPane />
			{/if} -->
		{:else}
			loading...
		{/if}
	</div>
</main>

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
		width: 100%;
		height: 300px;
		margin-bottom: 50px;
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.images img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.community {
		text-align: center;
	}

	.community button {
		font-family: 'Roboto Mono', monospace;
	}

	.forks {
	}

	.remix-grid {
		margin-bottom: 40px;
	}

	button {
		margin-left: 2px;
		margin-right: 2px;
	}

	.parentInfo {
		position: absolute;
		top: 0px;
		left: 100%;
		margin-left: 20px;
		width: 250px;
		height: 250px;
	}

	.edit {
		cursor: pointer;
	}

	.delete {
		color: #c00;
	}
</style>
