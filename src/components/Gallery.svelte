<script>
	import { store } from '../store/state.svelte.js';
	import { db, storage } from '../dbConfig';
	import { ref, listAll } from 'firebase/storage';
	import { getDoc, doc, setDoc } from 'firebase/firestore';

	let allData = $state();

	async function fetchAllPosts() {
		const docRef = doc(db, 'posts', 'allPosts');
		const docSnap = await getDoc(docRef);

		if (docSnap.exists()) {
			allData = docSnap.data();
		} else {
			console.log('No such document!');
		}

		// Sort the posts by date for displaying
		const sortedEntries = Object.entries(allData).sort((a, b) => {
			return a[1].created.seconds - b[1].created.seconds;
		});
		allData = Object.fromEntries(sortedEntries.reverse());
	}

	fetchAllPosts();
</script>

<div class="page-container">
	<h1>Gallery</h1>
	{#if allData}
		<div class="grid">
			{#each Object.entries(allData) as [postID, postData]}
				<div class="project-tile {postData.isFork ? 'shadowRemix' : 'shadow'}">
					<a aria-label="Project" href="/fabs/{postID}">
						<div class="project-photo-container">
							<img
								alt="Contributed Project"
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
						by <a href="/users/{postData.authorUID}">{postData.username}</a>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		loading...
	{/if}
</div>

<style>
</style>
