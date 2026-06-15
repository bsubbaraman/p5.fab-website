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
	import DiffReel from '../../../components/DiffReel.svelte';

	let { data } = $props(); // to pass in dynamic parameters, setup in +page.js
	let postData = $state();
	let objectID = $state();
	let docRef = $state();
	let projectLog = $state();
	let originalLog = $state(null);
	let modifiedLog = $state(null);
	let thumbnails = $state(null);
	let diffIndex = $state(0);
	let originalGalleryIndex = $state(0);
	let modifiedGalleryIndex = $state(0);
	let status = $state('loading'); // 'loading' | 'ready' | 'notfound' | 'nolog' | 'error'

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
			projectLog = post.projectLog;
			if (!projectLog || projectLog.length < 2) {
				status = 'nolog'; // a timeline needs at least two logged iterations to diff
				return;
			}
			thumbnails = projectLog.map((entry) => entry.files[0]);
			originalLog = projectLog[diffIndex];
			modifiedLog = projectLog[diffIndex + 1];
			status = 'ready';
		} catch (e) {
			console.error('Failed to load timeline', e);
			status = 'error';
		}
	}

	function updateDiff() {
		originalLog = projectLog[diffIndex];
		modifiedLog = projectLog[diffIndex + 1];
	}

	function getDate() {
		// TODO: Might want to show 'modified' date at some point?
		const createdDate = postData.created.toDate();
		const month = createdDate.toLocaleString('default', { month: 'long' });
		const day = createdDate.getUTCDate();
		const year = createdDate.getFullYear();
		return `${month} ${day} ${year} `;
	}

	$effect(() => {
		if (modifiedLog !== null) {
			originalLog = projectLog[diffIndex];
			modifiedLog = projectLog[diffIndex + 1];
			// updateDiff(diffIndex);
			originalGalleryIndex = 0;
			modifiedGalleryIndex = 0;
		}
	});
	fetchPostData();
</script>

<main>
	<Header />
	{#if status === 'ready'}
		<div class="page-container card">
			<div class="diff-reel">
				<DiffReel bind:overlayStart={diffIndex} images={thumbnails} />
			</div>

			<div class="diff-info-row">
				<div class="diff-info-col">
					<ImageGallery bind:current={originalGalleryIndex} images={originalLog.files} />
					<div class="fabInfo">
						<h3>Info</h3>
						{originalLog.changeLog}
					</div>
				</div>
				<div class="diff-info-col">
					<ImageGallery bind:current={modifiedGalleryIndex} images={modifiedLog.files} />
					<div class="fabInfo">
						<h3>Info</h3>
						{modifiedLog.changeLog}
					</div>
				</div>
			</div>
			<div class="diff">
				<CodeDiff
					bind:original={originalLog}
					bind:modified={modifiedLog}
					mode="side-by-side"
					isLog="true"
				/>
			</div>
		</div>
	{:else if status === 'notfound'}
		This sketch doesn't exist.
	{:else if status === 'nolog'}
		No timeline yet — this project needs at least two logged iterations.
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

	.diff-reel {
		display: flex;
		justify-content: center; /* centers horizontally */
		align-items: center; /* centers vertically if there's height */
		width: 100%;
		margin-top: 50px;
		margin-bottom: 100px;
	}

	.diff {
		max-height: 70vh;
		overflow: scroll;
		margin-top: 50px;
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
