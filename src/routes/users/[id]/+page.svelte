<script>
	import Header from '../../../components/Header.svelte';
	import { db } from '../../../dbConfig';
	import { getDoc, doc, collection, query, where, orderBy, getDocs } from 'firebase/firestore';

	let { data } = $props();
	let userData = $state();
	let postsData = $state();

	async function fetchUserData() {
		const userID = data.id;

		// Get user profile
		const docSnap = await getDoc(doc(db, 'users', userID));
		if (docSnap.exists()) {
			userData = docSnap.data();
		} else {
			console.log('No such user!');
			return;
		}

		// Get this user's posts, sorted by date
		const q = query(
			collection(db, 'posts'),
			where('authorUID', '==', userID),
			orderBy('created', 'desc')
		);
		const snap = await getDocs(q);
		const result = {};
		snap.forEach((doc) => { result[doc.id] = doc.data(); });
		postsData = result;
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
			{#if postsData && Object.keys(postsData).length}
				<div class="grid">
					{#each Object.entries(postsData) as [postID, postData]}
						{#if true}
							<div class="project-tile {postData.isFork ? 'shadowRemix' : 'shadow'}">
								<a aria-label="Project page" href="/fabs/{postID}">
									<div class="project-photo-container">
										<img
											alt="Contributed project"
											class="project-photo"
											src={postData.thumbnail ?? postData.files?.[0]}
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
