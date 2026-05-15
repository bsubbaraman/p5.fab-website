<script>
	import { onMount, tick } from 'svelte';
	import { editorState, store } from '../../../store/state.svelte.js';
	import { evalSketch } from '$lib/repl';
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

	onMount(async () => {
		editorState.p5Initialized = false;
		initIframe = true;
		await fetchSketchData();
		await tick();
		Split(['#left', '#right'], {});
		Split(['#left-top', '#left-bottom'], {
			direction: 'vertical',
			sizes: [80, 20]
		});
	});

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
					{#if initIframe}
						<iframe title="fab" onload={handleIframeLoad} id="preview" src="/preview.html" sandbox="allow-scripts allow-same-origin allow-downloads"></iframe>
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
	iframe {
		width: 100%;
		height: 100%;
		border: 0;
		display: block;
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
</style>
