<script>
	import Header from '../../../components/Header.svelte';
	import { store } from '../../../store/state.svelte.js';
	import { db, storage } from '../../../dbConfig';
	import { ref, listAll } from 'firebase/storage';
	import { getDoc, doc, setDoc, updateDoc, increment } from 'firebase/firestore';
	import { toggleAuthContainer } from '$lib/events/auth';
	import { getPostFromDB } from '$lib/dbLoadSave';
	import RemixPane from '../../../components/RemixPane.svelte';
	import Share from '../../../components/Share.svelte';

	let { data } = $props(); // to pass in dynamic parameters, setup in +page.js
	let postData = $state();
	let objectID = $state();
	let docRef = $state();
	let displayShareScreen = $state(false);

	async function fetchPostData() {
		// Get info about the Fab
		objectID = data.id;
		postData = await getPostFromDB(objectID);
		docRef = doc(db, 'posts', objectID);
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

	fetchPostData();
</script>

<main>
	<Header />
	<div class="page-container card">
		{#if displayShareScreen}
			<Share bind:displayShareScreen {postData} {objectID} />
		{:else if postData && store.allPostsData}
			<div class="fabHeader">
				<h1 class="fabName">{postData.name}</h1>
				<span class="meta"
					>by <b><a href="/users/{postData.authorUID}">{postData.username}</a></b></span
				><br />
				{#if postData.isFork}
					<span class="meta"
						>remix of <b
							><a data-sveltekit-reload href="/fabs/{postData.parentSketch}"
								>{store.allPostsData[postData.parentSketch].name}</a
							></b
						></span
					><br />
				{/if}
				<span class="meta">{getDate()}</span>
				{#if store.user && store.user.uid == postData.authorUID}
					<br />
					<span class="meta" onclick={toggleShareScreen}><b>edit</b></span>
				{/if}
			</div>

			<div class="card-content">
				<div class="images">
					<img alt="Contributed project" src={postData.files[0]} />
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
					{postData.info}
				</div>
				{#if postData.isFork}
					<h3>Remixed from</h3>
					<div class="remix-grid">
						<div
							class="project-tile {store.allPostsData[postData.parentSketch].isFork
								? 'shadowRemix'
								: 'shadow'}"
						>
							<a
								aria-label="Project page"
								data-sveltekit-reload
								href="/fabs/{postData.parentSketch}"
							>
								<div class="project-photo-container">
									<img
										alt="Contributed project"
										class="project-photo padding-bottom-std"
										src={store.allPostsData[postData.parentSketch].thumbnail}
									/>
									{#if store.allPostsData[postData.parentSketch].isFork}
										<div class="overlayText">Fork</div>
									{/if}
								</div>
							</a>
							<a data-sveltekit-reload href="/fabs/{postData.parentSketch}">
								<div class="project-title padding-bottom-half">
									{store.allPostsData[postData.parentSketch].name}
								</div>
							</a>

							<div class="author padding-bottom-std">
								by <a href="/users/{postData.parentAuthor}"
									>{store.allPostsData[postData.parentSketch].username}</a
								>
							</div>
						</div>
					</div>
					<!-- The below is for displaying parent in right margin -->
					<!-- <div class="parentInfo">
						<div class="project-tile shadow">
							<a
								aria-label="Project page"
								data-sveltekit-reload
								href="/fabs/{postData.parentSketch}"
							>
								<div class="project-photo-container">
									<img
										alt="Contributed project"
										class="project-photo padding-bottom-std"
										src={store.allPostsData[postData.parentSketch].thumbnail}
									/>
								</div>
							</a>
							<a data-sveltekit-reload href="/fabs/{postData.parentSketch}">
								<div class="project-title padding-bottom-half">
									{store.allPostsData[postData.parentSketch].name}
								</div>
							</a>

							<div class="author padding-bottom-std">
								by <a href="/users/{postData.parentAuthor}"
									>{store.allPostsData[postData.parentSketch].username}</a
								>
							</div>
						</div>
					</div> -->
				{/if}
				<div class="forks">
					<h3>Forks</h3>
					{#if !postData.numForks}
						No forks yet! Wanna make one?
					{:else}
						<div class="remix-grid">
							{#each Object.entries(postData.forks) as [forkIndex, forkData]}
								<div class="project-tile shadowRemix">
									<a
										aria-label="Project page"
										data-sveltekit-reload
										href="/fabs/{forkData.objectID}"
									>
										<div class="project-photo-container">
											<img
												alt="Contributed project"
												class="project-photo padding-bottom-std"
												src={store.allPostsData[forkData.objectID].thumbnail}
											/>
											<div class="overlayText">Fork</div>
										</div>
									</a>
									<a data-sveltekit-reload href="/fabs/{forkData.objectID}">
										<div class="project-title padding-bottom-half">
											{store.allPostsData[forkData.objectID].name}
										</div>
									</a>

									<div class="author padding-bottom-std">
										by <a href="/users/{forkData.authorUID}">{forkData.username}</a>
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
</style>
