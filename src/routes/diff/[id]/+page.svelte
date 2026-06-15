<script>
	import Header from '../../../components/Header.svelte';
	import { store } from '../../../store/state.svelte.js';
	import CodeDiff from '../../../components/CodeDiff.svelte';
	import ImageGallery from '../../../components/ImageGallery.svelte';
	import { db, storage } from '../../../dbConfig';
	import { ref, listAll } from 'firebase/storage';
	import { getDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
	import { toggleAuthContainer } from '$lib/events/auth';
	import { getPostFromDB } from '$lib/dbLoadSave';
	import RemixPane from '../../../components/RemixPane.svelte';
	import { onMount } from 'svelte';

	let { data } = $props(); // to pass in dynamic parameters, setup in +page.js
	let postData = $state(null);
	let parentPostData = $state(null);
	let objectID = $state();
	let docRef = $state();
	let status = $state('loading'); // 'loading' | 'ready' | 'notfound' | 'noparent' | 'error'

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
			if (!post.parentSketch) {
				status = 'noparent';
				return;
			}
			const parent = await getPostFromDB(post.parentSketch);
			if (!parent) {
				status = 'noparent'; // original was deleted — nothing to diff against
				return;
			}
			parentPostData = parent;
			status = 'ready';
		} catch (e) {
			console.error('Failed to load diff', e);
			status = 'error';
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

	fetchPostData();
</script>

<main>
	<Header />
	{#if status === 'ready'}
		<div class="page-container card">
			<div class="diff-info-row">
				<div class="diff-info-col">
					<div class="titles">
						<span><b>{parentPostData.name}</b> <br /><i>by {parentPostData.username}</i></span>
					</div>
					<ImageGallery images={parentPostData.files} />
					<div class="fabInfo">
						<h3>Info</h3>
						{parentPostData.info}
					</div>
				</div>
				<div class="diff-info-col">
					<div class="titles">
						<span><b>{postData.name}</b> <br /><i>by {postData.username}</i></span>
					</div>
					<ImageGallery images={postData.files} />
					<div class="fabInfo">
						<h3>Info</h3>
						{postData.info}
					</div>
				</div>
			</div>
			<div class="diff">
				<CodeDiff original={parentPostData} modified={postData} mode="side-by-side" />
			</div>
		</div>
	{:else if status === 'notfound'}
		This sketch doesn't exist.
	{:else if status === 'noparent'}
		There's nothing to compare — this sketch isn't a remix, or the original is no longer available.
	{:else if status === 'error'}
		Couldn't load this — please refresh to try again.
	{:else}
		loading...
	{/if}
</main>

<style>
	.card {
		/* overwrite default width */
		max-width: 90vw;
		margin-left: auto;
		margin-right: auto;
		padding: 30px;
	}

	.diff {
		max-height: 70vh;
		overflow: scroll;
		margin-bottom: 25px;
	}

	.diff-info-row {
		display: flex;
		justify-content: center;
		gap: 60px; /* space between columns */
	}

	.diff-info-col {
		width: 45vw; /* or match your CodeDiff column width */
		align-items: center;
		display: flex;
		flex-direction: column;
	}

	.fabInfo {
		width: 100%;
		text-align: left;
		margin-top: 25px;
		margin-bottom: 25px;
	}

	.titles {
		display: flex;
		justify-content: space-between;

		padding: 20px;
		font-size: 0.9rem;
	}

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
