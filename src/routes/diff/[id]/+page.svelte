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

	async function fetchPostData() {
		// Get info about the Fab
		console.log('getting post data');
		objectID = data.id;
		postData = await getPostFromDB(objectID);
		docRef = doc(db, 'posts', objectID);

		// Get parent code
		const parentID = postData.parentSketch;
		parentPostData = await getPostFromDB(parentID);
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
	{#if parentPostData !== null}
		<div class="page-container card">
			<div class="diff">
				<CodeDiff original={parentPostData} modified={postData} mode="side-by-side" />
			</div>
			<div class="diff-info-row">
				<div class="diff-info-col">
					<ImageGallery images={parentPostData.files} />
					<div class="fabInfo">
						<h3>Info</h3>
						{parentPostData.info}
					</div>
				</div>
				<div class="diff-info-col">
					<ImageGallery images={postData.files} />
					<div class="fabInfo">
						<h3>Info</h3>
						{postData.info}
					</div>
				</div>
			</div>
		</div>
	{:else}
		loading
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
