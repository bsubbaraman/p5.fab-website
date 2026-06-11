<script>
	import { onMount, onDestroy, tick } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { editorState, store } from '../../../store/state.svelte.js';
	import { evalSketch, evalCode } from '$lib/repl';
	import { db, storage } from '../../../dbConfig';
	import { getDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
	import { getPostFromDB } from '$lib/dbLoadSave.js';
	import { templateSketch } from '$lib/examples/examples';
	import EditorHeader from '../../../components/EditorHeader.svelte';
	import Editor from '../../../components/Editor.svelte';
	import EditorShare from '../../../components/EditorShare.svelte';
	import Output from '../../../components/Output.svelte';
	import SignIn from '../../../components/SignIn.svelte';
	import SignUp from '../../../components/SignUp.svelte';
	import RemixPane from '../../../components/RemixPane.svelte';
	import Split from 'split.js';
	import EditorLog from '../../../components/EditorLog.svelte';
	import MachineStatus from '../../../components/MachineStatus.svelte';
	import { doGcodeDownload } from '$lib/download.js';
	import { previewUrl } from '$lib/sandbox.js';

	let { data } = $props(); // to pass in dynamic parameters, setup in +page.js
	let initIframe = $state(false);
	let sketchLoaded = $state(false);
	let objectID = $state();

	async function fetchSketchData() {
		console.log('fetching sketch data');
		objectID = data.id;
		if (objectID == 'new') {
			editorState.globalSketch = templateSketch;
			editorState.savedSketchData = {
				new: true
			};
			editorState.sketchIsFork = false;
			sketchLoaded = true;
			return;
		} else {
			const sketchData = await getPostFromDB(objectID);
			console.log('GOT SKETCH DATA');
			if (!sketchData) {
				alert("I can't find that id!");
				// Route to a new sketch page
				window.location.href = `/sketch/new`;
			} else {
				loadSketchData(sketchData);
				sketchLoaded = true;
			}
		}
	}

	function loadSketchData(sketchData) {
		console.log('loading sketch data');
		editorState.globalSketch = sketchData.code;
		console.log(sketchData.code);
		editorState.projectTitle = sketchData.name;
		editorState.currentObjectID = objectID;
		editorState.savedSketchData = sketchData; // might need to do other stuff with this?
		editorState.sketchIsFork = sketchData.isFork;
		editorState.remixTree = null; // reset so RemixPane rebuilds for this sketch
		console.log(editorState.sketchIsFork);
		console.log('loading sketch data done');
	}

	beforeNavigate(({ cancel }) => {
		if (!editorState.saved) {
			const confirmed = confirm(
				"This page is asking you to confirm that you want to leave — information you've entered may not be saved."
			);
			if (!confirmed) cancel();
		}
	});

	function handleBeforeUnload(e) {
		if (!editorState.saved) {
			e.preventDefault();
		}
	}

	onMount(async () => {
		window.addEventListener('beforeunload', handleBeforeUnload);
		editorState.p5Initialized = false;
		initIframe = true;
		await fetchSketchData();
		editorState.saved = true;
		await tick();
		Split(['#left', '#right'], {});
		Split(['#left-top', '#left-bottom'], {
			direction: 'vertical',
			sizes: [80, 20]
		});
	});

	onDestroy(() => {
		if (typeof window !== 'undefined') {
			window.removeEventListener('beforeunload', handleBeforeUnload);
		}
	});

	function printAnyway() {
		editorState.staleCodeModal = false;
		evalCode('fab.print()');
	}

	function downloadGcodeAnyway() {
		editorState.staleGcodeDownloadModal = false;
		doGcodeDownload();
	}

	function handleIframeLoad() {
		console.log('iframe loaded');
		const sketchWindow = document.getElementById('preview');
		editorState.sketchWindow = sketchWindow;
		console.log('going to eval sketch in iFrame load');
		evalSketch(editorState.globalSketch);
	}
</script>

<main>
	{#if sketchLoaded}
		<EditorHeader />
		{#if editorState.displaySaveScreen}
			<EditorShare />
		{/if}

		{#if editorState.displayLogScreen}
			<EditorLog />
		{/if}

		{#if !store.user && store.displayLogin}
			{#if store.displaySignUp}
				<SignUp />
			{:else}
				<SignIn />
			{/if}
		{/if}

		{#if editorState.displayRemixPane}
			<RemixPane />
		{/if}

		{#if editorState.staleCodeModal}
			<div class="alert-overlay">
				<div class="alert-modal">
					<p>
						Your sketch has changed since the last run. Continue printing with commands from the
						previous run?
					</p>
					<div class="modal-buttons">
						<button onclick={printAnyway}>Print Anyway</button>
						<button onclick={() => (editorState.staleCodeModal = false)}>Cancel</button>
					</div>
				</div>
			</div>
		{/if}

		{#if editorState.staleGcodeDownloadModal}
			<div class="alert-overlay">
				<div class="alert-modal">
					<p>Your sketch has changed since the last run. Download GCode from the previous run?</p>
					<div class="modal-buttons">
						<button onclick={downloadGcodeAnyway}>Download Anyway</button>
						<button onclick={() => (editorState.staleGcodeDownloadModal = false)}>Cancel</button>
					</div>
				</div>
			</div>
		{/if}

		{#if editorState.printAlert}
			<div class="alert-overlay">
				<div class="alert-modal">
					<p>{editorState.printAlert}</p>
					<button onclick={() => (editorState.printAlert = null)}>Dismiss</button>
				</div>
			</div>
		{/if}

		<div class="split">
			<div id="left">
				<div id="left-top">
					<div id="editor">
						<Editor />
					</div>
				</div>
				<div id="left-bottom">
					<Output />
				</div>
			</div>

			<div id="right">
				<div id="right-top">
					{#if editorState.isParsing}
						<div class="parsing-badge">Building viz...</div>
					{/if}
					{#if initIframe}
						<iframe
							title="fab"
							onload={handleIframeLoad}
							id="preview"
							src={previewUrl()}
							sandbox="allow-scripts allow-same-origin allow-downloads"
							allow="serial"
						></iframe>
					{/if}
				</div>
				<div id="right-bottom">
					<MachineStatus />
				</div>
			</div>
		</div>
	{/if}
</main>

<style>
	#right-top {
		position: relative;
	}

	iframe {
		width: 100%;
		height: 100%;
		border: 0;
		display: block;
	}

	.parsing-badge {
		position: absolute;
		top: 0.5rem;
		left: 0.5rem;
		z-index: 10;
		background: white;
		border: 1px solid black;
		padding: 0.15rem 0.5rem;
		font-family: var(--font-mono, monospace);
		font-size: 0.75rem;
		pointer-events: none;
	}

	main {
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	:global(.split) {
		flex: 1 !important;
		height: auto !important;
		min-height: 0;
	}

	#left-bottom {
		overflow: scroll;
	}

	.alert-overlay {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.alert-modal {
		background: white;
		border: 1px solid black;
		box-shadow: 7px 7px var(--ma-orange);
		padding: 2em;
		max-width: 480px;
		text-align: left;
		font-family: 'Inter', sans-serif;
	}

	.alert-modal p {
		margin: 0 0 1.25em;
		font-size: 1em;
		line-height: 1.5;
	}

	.alert-modal button {
		display: block;
		margin: 0 auto;
	}

	.modal-buttons {
		display: flex;
		justify-content: center;
		gap: 0.75rem;
	}
</style>
