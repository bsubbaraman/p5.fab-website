<script>
	import { page } from '$app/state';
	import { getDoc, doc, collection, addDoc, updateDoc } from 'firebase/firestore';
	import { db, storage } from '../dbConfig.js';
	import { editorState, store, authHandlers } from '../store/state.svelte.js';
	import { evalSketch } from '$lib/repl';
	import { connectToMachine } from '$lib/events/connectToMachine';
	import { startPrint } from '$lib/events/startPrint';
	import { toggleAuthContainer } from '$lib/events/auth.js';
	import SignIn from './SignIn.svelte';
	import SignUp from './SignUp.svelte';
	import EditorShare from './EditorShare.svelte';
	import Editor from './Editor.svelte';

	let isNewSketch = $state();
	let userIsAuthor = $state();

	function validateTitle(event) {
		// Limit title length and no newlines
		// TODO: Minimal censoring?
		const maxTitleLength = 100;
		const el = event.target;
		if (el.innerText.length >= maxTitleLength && event.key.length === 1) {
			event.preventDefault();
		} else if (event.key == 'Enter') {
			console.log('enter');
			event.preventDefault();
		}

		if (editorState.saved) {
			editorState.saved = false;
			const saveButton = document.getElementById('sketchSaveBtn');
			saveButton.disabled = false;
		}
	}

	function onFocus(event) {
		const el = event.target;
		const selection = window.getSelection();
		const range = document.createRange();
		range.selectNodeContents(el);
		selection.removeAllRanges();
		selection.addRange(range);
	}

	function onBlur() {
		editorState.projectTitle = editorState.projectTitle.replaceAll('&nbsp;', ' ');
		if (editorState.projectTitle.includes('<br>')) {
			editorState.projectTitle = 'Untitled Project';
		}
		if (editorState.projectTitle.trim() === '') {
			editorState.projectTitle = 'Untitled Project';
		}
	}

	function handleSave() {
		if (!store.user) {
			// somewhere else, set the saveText
			alert('Login or signup to save!');
			toggleAuthContainer();
			return;
		}

		if (isNewSketch || !userIsAuthor) {
			editorState.displaySaveScreen = true;
		} else if (userIsAuthor) {
			updateSavedSketch();
		}
	}

	async function updateSavedSketch() {
		// Update post
		const docRef = doc(db, 'posts', editorState.currentObjectID);
		const modifiedTime = new Date();
		await updateDoc(docRef, {
			code: editorState.globalSketch,
			name: editorState.projectTitle,
			modified: modifiedTime
		});

		// Update data for feed
		const allPostsRef = doc(db, 'posts', 'allPosts');
		const allPostsSnap = await getDoc(allPostsRef);
		if (allPostsSnap.exists()) {
			const data = allPostsSnap.data();
			const objectData = data[editorState.currentObjectID];
			objectData.name = editorState.projectTitle;
			await updateDoc(allPostsRef, {
				[editorState.currentObjectID]: objectData
			});
		}

		editorState.saveText = 'saved';
		const saveButton = document.getElementById('sketchSaveBtn');
		saveButton.disabled = true;
		editorState.saved = true;
	}

	$effect(() => {
		isNewSketch = editorState.savedSketchData.hasOwnProperty('new');
		if (store.user) {
			userIsAuthor = editorState.savedSketchData.authorUID == store.user.uid;
		}

		if (!editorState.saved) {
			if (isNewSketch) {
				editorState.saveText = 'save';
			} else {
				if (store.user) {
					if (!userIsAuthor) {
						editorState.saveText = 'save as fork';
					} else {
						editorState.saveText = 'save';
					}
				}
			}
		}
	});

	function handleForks(e) {
		// TODO: If I remove console.log, button is sometimes fired twice on rapid clicks
		console.log(e);
		editorState.displayRemixPane = !editorState.displayRemixPane;
	}
</script>

<header>
	<div class="nav-bar">
		<div class="nav-left">
			<div class="dropdown">
				<div class="logo menu-item">p5.fab</div>
				<div class="dropdown-content">
					{#if !store.user}
						<button onclick={toggleAuthContainer} class="dropdownBtn">My Projects</button>
					{:else}
						<a href="/users/{store.user.uid}" target="_blank">My Projects</a>
					{/if}
					<a href="/explore" target="_blank" class:active={page.url.pathname == '/explore'}
						>Explore</a
					>
				</div>
			</div>
			<div class="menu-item">
				<button onclick={() => evalSketch(editorState.globalSketch)}>run</button>
			</div>
			<div class="menu-item">
				<button onclick={connectToMachine}>connect</button>
			</div>
			<div class="menu-item">
				<button onclick={startPrint}>print</button>
			</div>
		</div>

		<div class="navbar-center">
			<span
				contenteditable="plaintext-only"
				spellcheck="false"
				bind:textContent={editorState.projectTitle}
				onfocus={onFocus}
				onblur={onBlur}
				onkeydown={validateTitle}
				class="title"
				role="textbox"
				tabindex="0"
			></span>
		</div>

		<div class="nav-right">
			{#if !isNewSketch}
				<div class="menu-item">
					<button id="forks" onmousedown={handleForks}>forks</button>
				</div>
			{/if}
			<div class="menu-item">
				<button id="sketchSaveBtn" onclick={handleSave}>{editorState.saveText}</button>
			</div>
		</div>
	</div>
</header>

<style>
	.nav-bar {
		display: flex;
		align-items: center;
		position: relative;
		height: 1.75em;
		background-color: var(--nord6);
	}

	.nav-left {
		display: flex;
		align-items: center;
	}

	.nav-right {
		position: absolute;
		right: 0;
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		align-items: center;
	}

	.navbar-center {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		justify-content: center;
		align-items: center;
		width: max-content;
		text-align: center;
		z-index: 2;
		background-color: var(--nord6);
	}

	.menu-item {
		cursor: pointer;
		vertical-align: right;
		display: inline;
		position: relative;
		font-size: 1em;
	}

	.menu-item:hover {
		background-color: #ff6700;
	}

	.logo {
		color: black;
		text-decoration: none;
		font-size: 1em;
		font-family: Roboto Mono;
		padding: 3px;
	}

	.dropdown {
		position: relative;
		display: inline-block;
	}

	.dropdown-content {
		display: none;
		position: absolute;
		top: 1.55em;
		background-color: var(--nord5);
		min-width: 160px;
		box-shadow: 0px 8px 16px 0px rgba(0, 0, 0, 0.2);
		z-index: 1;
		flex-direction: column;
	}

	.dropdown:hover .dropdown-content,
	.dropdown-content:hover {
		display: flex;
		visibility: visible;
	}

	.dropdown-content a,
	.dropdownBtn {
		font-size: 0.8em;
		padding: 10px 4px;
		text-decoration: none;
		letter-spacing: normal;
		padding-left: 10px;
		font-family: 'Inter', sans-serif;
		text-align: left;
		cursor: pointer;
		height: 100%;
	}

	.dropdown-content a:hover,
	.dropdownBtn:hover {
		color: var(--white);
		background-color: var(--nord3);
	}

	button {
		background-color: var(--nord6);
		height: 1.75em;
		text-decoration: none;
		border: none;
		border-radius: 0;
	}

	button:hover {
		background-color: #ff6700;
	}

	.title {
		font-size: 1em;
		font-weight: 500;
		vertical-align: right;
		display: block;
		position: relative;
	}

	[contenteditable='plaintext-only']:focus {
		font-weight: 300;
		caret-color: black;
		outline: none;
	}

	::selection {
		background: var(--pink);
	}
</style>
