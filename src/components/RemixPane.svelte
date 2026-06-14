<script>
	import { editorState } from '../store/state.svelte.js';
	import { db } from '../dbConfig.js';
	import { getPostFromDB } from '$lib/dbLoadSave.js';
	import { collection, query, where, getDocs } from 'firebase/firestore';

	let treeHTML = $state('');
	let hasRemixes = $state(null); // null = still loading

	function escapeHTML(str) {
		return String(str)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	// Walk up the parentSketch chain to the originating sketch.
	async function getOriginator(objectID) {
		const postData = await getPostFromDB(objectID);
		if (!postData || !postData.isFork) {
			return objectID;
		}
		return getOriginator(postData.parentSketch);
	}

	// A node's children are the posts that point at it via parentSketch — derived from the
	// link each fork sets on itself, not from a denormalized forks array on the parent.
	async function getChildren(nodeID) {
		const snap = await getDocs(query(collection(db, 'posts'), where('parentSketch', '==', nodeID)));
		return snap.docs;
	}

	// Render a node and its subtree to HTML. nodeData is reused from the parent's
	// getChildren() result, so only the root costs an extra read; sibling subtrees are
	// fetched in parallel. Returns the HTML plus the node count (for the empty-state).
	async function renderNode(nodeID, nodeData) {
		if (!nodeData) nodeData = await getPostFromDB(nodeID);
		if (!nodeData) return { html: '', count: 0 };
		const currentNode = nodeID == editorState.currentObjectID ? "class='current'" : '';
		const safeName = escapeHTML(nodeData.name);
		const safeUsername = escapeHTML(nodeData.username);
		const safeAuthorUID = escapeHTML(nodeData.authorUID);
		const safeNodeID = escapeHTML(nodeID);
		const span = `<span ${currentNode}><code><a data-sveltekit-reload href='/sketch/${safeNodeID}'>${safeName}</a><br/>by: <a data-sveltekit-reload href='/users/${safeAuthorUID}'>${safeUsername}</a></code></span>`;

		const childDocs = await getChildren(nodeID);
		let childrenHTML = '';
		let count = 1;
		if (childDocs.length) {
			const subtrees = await Promise.all(childDocs.map((c) => renderNode(c.id, c.data())));
			childrenHTML = `<ul>${subtrees.map((s) => s.html).join('')}</ul>`;
			count += subtrees.reduce((n, s) => n + s.count, 0);
		}
		return { html: `<li>${span}${childrenHTML}</li>`, count };
	}

	async function makeRemixTree() {
		const current = editorState.currentObjectID;
		const isFork = !!editorState.savedSketchData?.isFork;
		const nodeZero = await getOriginator(current);
		const { html, count } = await renderNode(nodeZero, null);
		treeHTML = html;
		hasRemixes = isFork || count > 1;
	}

	makeRemixTree();
</script>

<div class="remix-container">
	{#if hasRemixes === null}
		loading remix tree...
	{:else if hasRemixes}
		<ul class="tree -stacked">
			{@html treeHTML}
		</ul>
		<div class="remix-graph">
			<a
				href="/graph/{editorState.currentObjectID}"
				target="_blank"
				rel="noopener noreferrer"
				class="remix-graph"
			>
				View Remix Graph
			</a>
		</div>
	{:else}
		No remixes yet!
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

	.remix-graph {
		margin-top: 25px;
		text-align: center;
	}

	/* Tree css lives in app.css */
</style>
