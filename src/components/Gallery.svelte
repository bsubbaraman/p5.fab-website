<script>
	import { db } from '../dbConfig';
	import { collection, query, orderBy, getDocs } from 'firebase/firestore';

	let allData = $state();

	async function fetchAllPosts() {
		const q = query(collection(db, 'posts'), orderBy('created', 'desc'));
		const snap = await getDocs(q);
		const result = {};
		snap.forEach((doc) => {
			if (doc.id !== 'allPosts') result[doc.id] = doc.data();
		});
		allData = result;
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
								src={postData.thumbnail ?? postData.files?.[0]}
								loading="lazy"
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
