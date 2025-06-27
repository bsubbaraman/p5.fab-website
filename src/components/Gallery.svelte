<script>
	import { store } from '../store/store';
	import { db, storage } from '../dbConfig';
	import { ref, listAll } from 'firebase/storage';
	import { getDoc, doc, setDoc } from 'firebase/firestore';

	let allData = $state();

	async function fetchAllPosts() {
		const docRef = doc(db, 'posts', 'allPosts');
		const docSnap = await getDoc(docRef);

		if (docSnap.exists()) {
			// Load in data
			allData = docSnap.data();
		} else {
			// docSnap.data() will be undefined in this case
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
				<div class="project-tile shadow">
					<a href="/fabs/{postID}">
						<div class="project-photo-container">
							<img class="project-photo padding-bottom-std" src={postData.thumbnail} />
						</div>
					</a>
					<a href="/fabs/{postID}">
						<div class="project-title padding-bottom-half">{postData.name}</div>
					</a>

					<div class="author padding-bottom-std">
						by <a href="/users/{postData.user}">{postData.username}</a>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		loading...
	{/if}
</div>
