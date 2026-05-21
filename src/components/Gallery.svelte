<script>
	import { onMount, tick } from 'svelte';
	import { db } from '../dbConfig';
	import { collection, query, orderBy, limit, startAfter, getDocs } from 'firebase/firestore';

	const PAGE_SIZE = 24;

	let posts = $state([]); // array of { id, ...data }
	let lastDoc = $state(null); // Firestore cursor
	let hasMore = $state(true);
	let loading = $state(false);
	let sentinel; // DOM element watched by IntersectionObserver

	async function fetchPage() {
		if (loading || !hasMore) return;
		loading = true;

		const constraints = [orderBy('created', 'desc'), limit(PAGE_SIZE)];
		if (lastDoc) constraints.push(startAfter(lastDoc));

		const snap = await getDocs(query(collection(db, 'posts'), ...constraints));
		const newPosts = [];
		snap.forEach((doc) => {
			if (doc.id !== 'allPosts') newPosts.push({ id: doc.id, ...doc.data() });
		});

		posts = [...posts, ...newPosts];
		lastDoc = snap.docs[snap.docs.length - 1] ?? lastDoc;
		hasMore = snap.docs.length === PAGE_SIZE;
		loading = false;

		// After DOM updates, check if sentinel is still in view and keep loading
		await tick();
		if (hasMore && sentinel) {
			const rect = sentinel.getBoundingClientRect();
			if (rect.top < window.innerHeight + 200) fetchPage();
		}
	}

	onMount(() => {
		fetchPage();

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) fetchPage();
			},
			{ rootMargin: '200px' }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	});
</script>

<div class="page-container">
	<h1>Gallery</h1>
	<div class="grid">
		{#each posts as post (post.id)}
			<div class="project-tile {post.isFork ? 'shadowRemix' : 'shadow'}">
				<a aria-label="Project" href="/fabs/{post.id}">
					<div class="project-photo-container">
						<img
							alt="Contributed Project"
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

	<!-- sentinel element — when visible, triggers the next page load -->
	<div bind:this={sentinel} class="sentinel">
		{#if loading}loading...{/if}
	</div>
</div>

<style>
	.sentinel {
		height: 1px;
		text-align: center;
		padding: 10px 0;
		color: #888;
		font-size: 0.85em;
	}
</style>
