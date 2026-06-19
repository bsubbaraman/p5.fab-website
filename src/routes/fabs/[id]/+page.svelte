<script>
	import Header from '../../../components/Header.svelte';
	import { store } from '../../../store/state.svelte.js';
	import { db } from '../../../dbConfig';
	import {
		getDoc,
		doc,
		updateDoc,
		deleteDoc,
		increment,
		arrayRemove,
		deleteField,
		collection,
		query,
		where,
		getDocs
	} from 'firebase/firestore';
	import { ref, listAll, deleteObject } from 'firebase/storage';
	import { storage } from '../../../dbConfig';
	import { toggleAuthContainer } from '$lib/events/auth';
	import { getPostFromDB } from '$lib/dbLoadSave';
	import ImageGallery from '../../../components/ImageGallery.svelte';
	import Share from '../../../components/Share.svelte';

	let { data } = $props();
	let postData = $state();
	let objectID = $state();
	let docRef = $state();
	let parentData = $state();
	let forkData = $state({});
	let forkCount = $derived(Object.keys(forkData).length);
	let galleryIndex = $state(0);
	let displayShareScreen = $state(false);
	let status = $state('loading'); // 'loading' | 'ready' | 'notfound' | 'error'

	async function fetchPostData() {
		objectID = data.id;
		docRef = doc(db, 'posts', objectID);
		try {
			const post = await getPostFromDB(objectID);
			if (!post) {
				status = 'notfound';
				return;
			}
			postData = post;
			status = 'ready'; // main content can render; related data loads best-effort below

			if (postData.isFork && postData.parentSketch) {
				parentData = await getPostFromDB(postData.parentSketch);
			}

			// Derive forks from the children's parentSketch link (no denormalized forks array).
			const forkSnap = await getDocs(
				query(collection(db, 'posts'), where('parentSketch', '==', objectID))
			);
			const forks = forkSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
			forks.sort((a, b) => (a.created?.toMillis?.() ?? 0) - (b.created?.toMillis?.() ?? 0));
			forkData = Object.fromEntries(forks.map((f) => [f.id, f]));
		} catch (e) {
			console.error('Failed to load post', e);
			// Only error if the main post never loaded — a parent/forks failure shouldn't
			// blank a page that already rendered.
			if (status !== 'ready') status = 'error';
		}
	}

	function formatDate(ts) {
		const d = typeof ts?.toDate === 'function' ? ts.toDate() : new Date(ts);
		const month = d.toLocaleString('default', { month: 'long' });
		return `${month} ${d.getDate()} ${d.getFullYear()}`;
	}

	function scrollToForks() {
		document.getElementById('forks')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	async function likePost() {
		if (!store.user) {
			toggleAuthContainer();
			return;
		}

		const uid = store.user.uid;
		const liked = store.favorites.includes(objectID);
		const counter = liked ? -1 : 1;

		try {
			// Update the post: count + this user's favoritedBy entry, atomically, so the
			// security rule can verify the ±1 corresponds to toggling your own like.
			await updateDoc(docRef, {
				favorites: increment(counter),
				[`favoritedBy.${uid}`]: counter > 0 ? true : deleteField()
			});

			// Mirror into the user's favorites array (drives heart state across the app).
			const nextFavorites = liked
				? store.favorites.filter((id) => id !== objectID)
				: [...store.favorites, objectID];
			const userRef = doc(db, 'users', uid);
			await updateDoc(userRef, { favorites: nextFavorites });

			// Commit local state only after both writes succeed, so a rejected write
			// can't leave the heart toggled while the database is unchanged.
			store.favorites = nextFavorites;
			postData.favorites += counter;
		} catch (err) {
			console.error('Like failed:', err);
		}
	}

	function toggleShareScreen() {
		displayShareScreen = !displayShareScreen;
	}

	function handleShareSaved(updates) {
		postData = { ...postData, ...updates };
		galleryIndex = 0;
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
			<Share bind:displayShareScreen {postData} {objectID} onSaved={handleShareSaved} />
		{:else if status === 'ready'}
			<div class="fabHeader">
				<h1 class="fabName">{postData.name}</h1>
				<span class="meta"
					>by <b><a href="/users/{postData.authorUID}">{postData.username}</a></b></span
				><br />
				{#if postData.isFork && parentData}
					<span class="meta"
						>remix of <b
							><a data-sveltekit-reload href="/fabs/{postData.parentSketch}">{parentData.name}</a
							></b
						></span
					><br />
				{/if}
				<span class="meta">
					published {formatDate(postData.created)}
					{#if postData.modified}
						| edited {formatDate(postData.modified)}{/if}
				</span>
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
					<button class="act act-narrow" onclick={likePost}>
						{#if store.user && store.favorites.includes(objectID)}
							<i class="fa-solid fa-heart"></i>
						{:else}
							<i class="fa-regular fa-heart"></i>
						{/if}
						{postData.favorites}
					</button>
					<a class="act act-wide" href="/sketch/{objectID}">
						<button>
							<i class="fa-solid fa-code"></i>
							Editor
						</button>
					</a>
					<button class="act act-narrow" onclick={scrollToForks}>
						<i class="fa-solid fa-code-fork"></i>
						{forkCount}
					</button>
					{#if postData.isFork || forkCount > 0}
						<a class="act act-wide" href="/graph/{objectID}">
							<button>
								<i class="fa-solid fa-hexagon-nodes"></i>
								Remix graph
							</button>
						</a>
					{:else}
						<button class="act act-wide" disabled>
							<i class="fa-solid fa-hexagon-nodes"></i>
							Remix graph
						</button>
					{/if}
					<a class="act act-wide" href="/timeline/{objectID}">
						<button disabled={postData.projectLog ? false : true}>
							<i class="fa-solid fa-film"></i>
							Timeline
						</button>
					</a>
					<!-- <button disabled={postData.fabscription ? false : true}>
						<i class="fa-solid fa-film"></i>
						Open Fabscription
					</button> -->
				</div>
				<div class="fabInfo">
					<h3>Info</h3>
					{#if postData.hasFabricated === 'yes'}
						{#if postData.machineType}
							<b>Machine:</b> {postData.machineType}<br />
						{/if}
						{#if postData.machineModel}
							<b>Model:</b> {postData.machineModel}<br />
						{/if}
						{#if postData.materials?.length}
							<b>Material:</b> {postData.materials.join(', ')}<br />
						{/if}
						{#if postData.machineType || postData.machineModel || postData.materials?.length}
							<br />
						{/if}
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
										class="project-photo"
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
				<div class="forks" id="forks">
					<h3>Forks</h3>
					{#if !forkCount}
						No forks yet! Wanna make one?
					{:else}
						<div class="remix-grid">
							{#each Object.entries(forkData) as [forkID, fd]}
								<div class="project-tile shadowRemix">
									<a aria-label="Project page" data-sveltekit-reload href="/fabs/{forkID}">
										<div class="project-photo-container">
											<img
												alt="Contributed project"
												class="project-photo"
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
		{:else if status === 'notfound'}
			This sketch doesn't exist.
		{:else if status === 'error'}
			Couldn't load this sketch — please refresh to try again.
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
		display: grid;
		grid-template-columns: repeat(12, 1fr);
		gap: 10px;
		max-width: 400px;
		margin: 0 auto;
	}

	.community button {
		font-family: 'Roboto Mono', monospace;
	}

	/* Top row: likes (left) · editor (center, longest) · forks (right) — 3 + 6 + 3 = 12.
	   Bottom row: remix graph · timeline — 6 + 6 = 12. Both rows fill the same width, so
	   the block stays edge-aligned and centered under the images. */
	.community .act {
		width: 100%;
		margin: 0;
	}

	.community .act-narrow {
		grid-column: span 3;
	}

	.community .act-wide {
		grid-column: span 6;
	}

	.community .act button {
		width: 100%;
		margin: 0;
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
