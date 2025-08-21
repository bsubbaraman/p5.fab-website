<script>
	import Header from '../../../components/Header.svelte';
	import { store } from '../../../store/state.svelte.js';
	import { db, storage } from '../../../dbConfig';
	import { ref, listAll } from 'firebase/storage';
	import { getDoc, doc, setDoc } from 'firebase/firestore';

	let { data } = $props();
	let userData = $state();
	let postsData = $state();

	async function fetchUserData() {
		// Get info about the user
		const userID = data.id;
		const docRef = doc(db, 'users', userID);
		const docSnap = await getDoc(docRef);

		if (docSnap.exists()) {
			userData = docSnap.data();
		} else {
			console.log('No such user!');
		}

		// Get post info
		const postsRef = doc(db, 'posts', 'allPosts');
		const postsSnap = await getDoc(postsRef);

		if (postsSnap.exists()) {
			postsData = postsSnap.data();
		} else {
			console.log('No such document!');
		}

		// Sort the posts by date for displaying
		const sortedEntries = Object.entries(postsData).sort((a, b) => {
			return a[1].created.seconds - b[1].created.seconds;
		});

		postsData = Object.fromEntries(sortedEntries.reverse());
	}

	function getDate() {
		const createdDate = userData.created.toDate();
		const month = createdDate.toLocaleString('default', { month: 'long' });
		const day = createdDate.getUTCDate();
		const year = createdDate.getFullYear();
		return `${month} ${day} ${year} `;
	}

	fetchUserData();
</script>

<main>
	<Header />
	<div class="page-container card">
		{#if userData && postsData}
			<div class="fabHeader">
				<h1 class="fabName">{userData.username}</h1>
				<span class="meta">joined {getDate()}</span><br />
			</div>

			<h2>Posts</h2>
			{#if Object.keys(userData.posts).length}
				<div class="grid">
					{#each Object.entries(postsData) as [postID, postData]}
						{#if Object.values(userData.posts).includes(postID)}
							<div class="project-tile {postData.isFork ? 'shadowRemix' : 'shadow'}">
								<a aria-label="Project page" href="/fabs/{postID}">
									<div class="project-photo-container">
										<img
											alt="Contributed project"
											class="project-photo padding-bottom-std"
											src={postData.thumbnail}
										/>
										{#if postData.isFork}
											<div class="overlayText">Fork</div>
										{/if}
									</div>
								</a>
								<a href="/fabs/{postID}">
									<div class="project-title padding-bottom-half">{postData.name}</div>
								</a>

								<div class="author padding-bottom-std">
									by <a href="/users/{postData.user}">{postData.username}</a>
								</div>
							</div>
						{/if}
					{/each}
				</div>
			{:else}
				No posts yet!
			{/if}
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

	.forks {
	}

	button {
		margin-left: 2px;
		margin-right: 2px;
	}

	/* Overriding some defaults from app.css */
	.grid {
		grid-template-columns: repeat(auto-fill, minmax(175px, 1fr));
	}

	.project-tile {
		height: 300px;
	}
</style>
