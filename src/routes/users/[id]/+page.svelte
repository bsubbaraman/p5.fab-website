<script>
	import { onMount, tick } from 'svelte';
	import Header from '../../../components/Header.svelte';
	import { db } from '../../../dbConfig';
	import {
		getDoc,
		doc,
		collection,
		query,
		where,
		orderBy,
		limit,
		startAfter,
		getDocs
	} from 'firebase/firestore';

	let { data } = $props();
	const userID = data.id;

	let userData = $state();
	let userMissing = $state(false);

	const PAGE_SIZE = 24;
	let posts = $state([]); // array of { id, ...data }
	let lastDoc = $state(null); // Firestore cursor
	let hasMore = $state(true);
	let loading = $state(false);
	let sentinel; // DOM element watched by IntersectionObserver

	async function fetchPage() {
		if (loading || !hasMore) return;
		loading = true;

		const constraints = [
			where('authorUID', '==', userID),
			orderBy('created', 'desc'),
			limit(PAGE_SIZE)
		];
		if (lastDoc) constraints.push(startAfter(lastDoc));

		const snap = await getDocs(query(collection(db, 'posts'), ...constraints));
		const newPosts = [];
		snap.forEach((d) => newPosts.push({ id: d.id, ...d.data() }));

		posts = [...posts, ...newPosts];
		lastDoc = snap.docs[snap.docs.length - 1] ?? lastDoc;
		hasMore = snap.docs.length === PAGE_SIZE;
		loading = false;

		// Keep loading if the sentinel is still in view (short pages / tall screens).
		await tick();
		if (hasMore && sentinel) {
			const rect = sentinel.getBoundingClientRect();
			if (rect.top < window.innerHeight + 200) fetchPage();
		}
	}

	function getDate() {
		const createdDate = userData.created.toDate();
		const month = createdDate.toLocaleString('default', { month: 'long' });
		const day = createdDate.getUTCDate();
		const year = createdDate.getFullYear();
		return `${month} ${day} ${year} `;
	}

	let observer;
	onMount(() => {
		(async () => {
			const docSnap = await getDoc(doc(db, 'users', userID));
			if (!docSnap.exists()) {
				userMissing = true;
				return;
			}
			userData = docSnap.data();
			await tick(); // the sentinel renders now that userData is set

			observer = new IntersectionObserver(
				(entries) => {
					if (entries[0].isIntersecting) fetchPage();
				},
				{ rootMargin: '200px' }
			);
			if (sentinel) observer.observe(sentinel);

			fetchPage();
		})();

		return () => observer?.disconnect();
	});
</script>

<main>
	<Header />
	<div class="page-container card">
		{#if userMissing}
			No such user!
		{:else if userData}
			<div class="fabHeader">
				<h1 class="fabName">{userData.username}</h1>
				<span class="meta">joined {getDate()}</span><br />
			</div>

			<h2>Posts</h2>
			{#if posts.length}
				<div class="grid">
					{#each posts as post (post.id)}
						<div class="project-tile {post.isFork ? 'shadowRemix' : 'shadow'}">
							<a aria-label="Project page" href="/fabs/{post.id}">
								<div class="project-photo-container">
									<img
										alt="Contributed project"
										class="project-photo"
										src={post.thumbnail ?? post.files?.[0]}
										loading="lazy"
									/>
									{#if post.isFork}
										<div class="overlayText">Fork</div>
									{/if}
								</div>
							</a>
							<a href="/fabs/{post.id}">
								<div class="project-title padding-bottom-half">{post.name}</div>
							</a>

							<div class="author padding-bottom-std">
								by <a href="/users/{post.authorUID}">{post.username}</a>
							</div>
						</div>
					{/each}
				</div>
			{:else if !hasMore}
				No posts yet!
			{/if}

			<!-- sentinel — when visible, loads the next page -->
			<div bind:this={sentinel} class="sentinel">
				{#if loading}loading...{/if}
			</div>
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

	.sentinel {
		height: 1px;
		text-align: center;
		padding: 10px 0;
		color: #888;
		font-size: 0.85em;
	}
</style>
