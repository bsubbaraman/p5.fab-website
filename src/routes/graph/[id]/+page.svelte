<script>
	import Header from '../../../components/Header.svelte';
	import { store } from '../../../store/state.svelte.js';
	import { db, storage } from '../../../dbConfig';
	import { ref, listAll } from 'firebase/storage';
	import { getDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
	import { toggleAuthContainer } from '$lib/events/auth';
	import { getPostFromDB } from '$lib/dbLoadSave';
	import RemixPane from '../../../components/RemixPane.svelte';
	import Share from '../../../components/Share.svelte';
	import RemixGraph from '../../../components/RemixGraph.svelte';

	let { data } = $props(); // to pass in dynamic parameters, setup in +page.js
	const objectID = data.id;

	async function fetchPostData() {}

	fetchPostData();
</script>

<main>
	<Header />
	<RemixGraph {objectID} />
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
