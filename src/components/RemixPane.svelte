<script>
	import { onMount } from 'svelte';
	import { store, authHandlers, editorState } from '../store/state.svelte.js';
	import { getPostFromDB } from '$lib/dbLoadSave.js';
	import Editor from './Editor.svelte';

	let remixTreeHTML = '';

	function getOriginator(objectID) {
		if (!store.allPostsData[objectID].isFork) {
			// This is the originating sketch, return to fork list
			return objectID;
		} else {
			const parentID = store.allPostsData[objectID].parentSketch;
			return getOriginator(parentID);
		}
	}

	async function renderTree(nodeID) {
		console.log('getting', nodeID, 'from db');
		const nodeData = await getPostFromDB(nodeID);
		const currentNode = nodeID == editorState.currentObjectID ? "class='current'" : '';
		console.log(currentNode);
		remixTreeHTML += `<li>`;
		remixTreeHTML += `<span ${currentNode}><code><a data-sveltekit-reload href='/sketch/${nodeID}'>${nodeData.name}</a><br/>by: <a data-sveltekit-reload href='/users/${nodeData.authorUID}'>${nodeData.username}</a></code></span>`;
		if (nodeData.numForks) {
			remixTreeHTML += '<ul>';
			for (const forkIndex in nodeData.forks) {
				const forkData = nodeData.forks[forkIndex];
				await renderTree(forkData.objectID);
			}
			remixTreeHTML += '</ul>';
		}
		remixTreeHTML += '</li>';

		return remixTreeHTML;
	}

	export async function makeRemixTree() {
		// Want to see the whole tree
		// So first find the originating sketch for this tree;
		const nodeZero = getOriginator(editorState.currentObjectID);
		editorState.remixTree = await renderTree(nodeZero);
		// Some template code if I want to add images later:
		// const htmlToAdd = `
		// 	<div class="forkEntry" style="padding-left: ${indent}px">
		// 		<img src=${store.allPostsData[forkData.objectID].thumbnail} alt="Forked project" class="forkImage" />
		// 		<div class="forkEntryLabel">
		// 			${store.allPostsData[forkData.objectID].name}
		// 			<div class="padding-bottom-std"></div>
		// 			by ${forkData.username}
		// 		</div>
		// 	</div>
		// 	`;
		// remixTreeHTML += htmlToAdd;
		// indent += indentIncrement;
	}
</script>

<div class="remix-container">
	{#if editorState.savedSketchData}
		{#if !editorState.savedSketchData.numForks && !editorState.savedSketchData.isFork}
			No remixes yet!
		{:else}
			<!-- {#await makeRemixTree()}
				loading remix tree...
			{:then remixTreeHTML}
				<ul class="tree -stacked">
					{@html editorState.remixTreeHTML}
				</ul>
			{/await} -->
			{#if !editorState.remixTree}
				{#await makeRemixTree()}
					loading remix tree...
				{:then remixTreeHTML}
					<ul class="tree -stacked">
						{@html editorState.remixTree}
					</ul>
				{/await}
			{:else}
				<ul class="tree -stacked">
					{@html editorState.remixTree}
				</ul>
			{/if}

			<!-- <div class="forkEntry">
				<img
					src={editorState.savedSketchData.files[0]}
					alt="Forked project"
					class="forkImageMain"
				/>
				<div class="forkEntryLabel">
					{editorState.savedSketchData.name}
					<div class="padding-bottom-std"></div>
					by {editorState.savedSketchData.username}
				</div>
			</div> -->
		{/if}
	{/if}
</div>

<style lang="scss">
	.remix-container {
		z-index: 102;
		padding: 20px;
		background: white;
		border: 2px dotted black;
		// border-top: 2px solid black;
		// border-left: 2px solid black;
		// box-shadow: 0 0 5px black;
		position: fixed;
		top: 1.75em;
		right: 0%;
		width: 300px;
		min-width: 300px;
		height: 100%;
		overflow: scroll;
	}

	/* Tree css lives in app.css */
</style>
