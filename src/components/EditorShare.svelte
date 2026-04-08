<script>
	import imageCompression from 'browser-image-compression';
	import { editorState, store } from '../store/state.svelte.js';
	import { db, storage } from '../dbConfig.js';
	import { getUserData } from '$lib/dbLoadSave.js';
	import { getDoc, doc, collection, addDoc, updateDoc, increment, arrayUnion } from 'firebase/firestore';
	import { ref, uploadBytes, uploadString, getDownloadURL } from 'firebase/storage';
	import Editor from './Editor.svelte';

	const MAX_FILES = 5;
	const COMPRESSION_OPTIONS = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true };

	let objectInfo = $state('');
	let hasFabricated = $state('yes');
	let files;
	let filePreviewURLs = $state([]);
	let selectedThumbnailIndex = $state(0);

	function toggleSavePane() {
		editorState.displaySaveScreen = !editorState.displaySaveScreen;
	}

	function uploadImages() {
		document.getElementById('images').click();
	}

	function handleFileSelect(e) {
		if (!e.target.files) return;
		if (e.target.files.length > MAX_FILES) {
			alert(`Max ${MAX_FILES} images per post.`);
			e.target.value = '';
			return;
		}
		files = e.target.files;
		selectedThumbnailIndex = 0;
		filePreviewURLs = Array.from(files).map((f) => URL.createObjectURL(f));
	}

	async function postObject(event) {
		event.preventDefault();

		// TODO: Self-forking
		const selfFork = false;
		var isFork = false;
		if (!editorState.savedSketchData.hasOwnProperty('new')) {
			isFork = editorState.savedSketchData.authorUID !== store.user.uid || selfFork;
		}

		try {
			if (!editorState.projectTitle) {
				alert('Give your object a name!');
				editorState.projectTitle = 'Untitled Project';
				return;
			} else if (!objectInfo) {
				alert('Add some info about your object!');
				return;
			}

			// Get the username by uid
			const uid = store.user.uid;
			const userRef = doc(db, 'users', uid);
			const docSnap = await getDoc(userRef);
			const userData = docSnap.data();
			const username = userData.username;
			const timeCreated = new Date();

			const dataToPost = {
				name: editorState.projectTitle,
				authorUID: uid,
				username: username,
				info: objectInfo,
				hasFabricated: hasFabricated,
				code: editorState.globalSketch,
				isFork: isFork,
				favorites: 0,
				numForks: 0,
				forks: [],
				created: timeCreated,
				modified: null,
				parentSketch: isFork ? editorState.currentObjectID : null,
				parentAuthor: isFork ? editorState.savedSketchData.authorUID : null
			};

			const docRef = await addDoc(collection(db, 'posts'), dataToPost);
			const objectID = docRef.id;

			var fileURLs = [];
			if (files) {
				// Compress and upload user-provided images
				for (var i = 0; i < files.length; i++) {
					const compressed = await imageCompression(files[i], COMPRESSION_OPTIONS);
					const storageRef = ref(storage, objectID + '/' + files[i].name);
					await uploadBytes(storageRef, compressed);
					const downloadURL = await getDownloadURL(storageRef);
					fileURLs.push(downloadURL);
				}
			} else {
				// Take a compressed JPEG screenshot for the thumbnail
				const iframe = document.getElementById('preview');
				const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
				const canvas = iframeDoc.querySelector('canvas');
				if (!canvas) {
					console.warn('Canvas not found in iframe.');
					return;
				}
				const dataURL = canvas.toDataURL('image/jpeg', 0.8);
				try {
					const storageRef = ref(storage, objectID + '/' + Date.now());
					await uploadString(storageRef, dataURL, 'data_url');
					const downloadURL = await getDownloadURL(storageRef);
					fileURLs.push(downloadURL);
				} catch (e) {
					console.log(e);
				}
			}

			await updateDoc(docRef, {
				files: fileURLs,
				thumbnail: fileURLs[selectedThumbnailIndex] ?? fileURLs[0] ?? null
			});

			// Add to the user's posts
			await updateDoc(userRef, {
				posts: arrayUnion(objectID)
			});

			// If this is a fork, update the remix data
			if (isFork) {
				const parentRef = doc(db, 'posts', editorState.currentObjectID);
				const parentSnap = await getDoc(parentRef);
				const remixDataToUpdate = {
					objectID: objectID,
					authorUID: store.user.uid,
					username: username,
					created: timeCreated
				};
				if (parentSnap.exists()) {
					await updateDoc(parentRef, {
						forks: arrayUnion(remixDataToUpdate),
						numForks: increment(1)
					});
				} else {
					console.log("Couldn't find record id");
				}
			}

			// Save the info so we know if we need to update things
			editorState.savedSketchData = dataToPost;
			editorState.currentObjectID = objectID;
			editorState.saved = true;
			editorState.saveText = 'saved';
			const saveButton = document.getElementById('sketchSaveBtn');
			saveButton.disabled = true;

			// Open the new Fab page
			window.open(`/fabs/${objectID}`, '_blank');
			editorState.displaySaveScreen = false;
		} catch (err) {
			alert(err);
		}
	}
</script>

<div class="shareContainer">
	<div class="shareForm">
		<button aria-label="Close" onclick={toggleSavePane} class="close">
			<i class="fa-solid fa-x"></i>
		</button>
		<form>
			<label for="title">Name</label>
			<input
				bind:value={editorState.projectTitle}
				type="text"
				class="input"
				id="title"
				placeholder="Enter a name for your work!"
				required
			/>
			<label for="info">Info</label>
			<textarea
				bind:value={objectInfo}
				type="text"
				class="input"
				id="info"
				placeholder="Tell everyone about what you made!"
				required
			></textarea>
			<label for="made">Have you tried physically making this?</label>
			<div class="made">
				<input bind:group={hasFabricated} name="hasFabricated" type="radio" id="yes" value="yes" />
				<label for="yes">Yes</label><br />
				<input bind:group={hasFabricated} name="hasFabricated" type="radio" id="no" value="no" />
				<label for="no">No</label>
			</div>
			<label for="images">Files</label>
			<button class="file-upload" type="button" onclick={uploadImages}>
				<i class="fa-solid fa-upload"></i><br />
				<span class="upload-text">Upload an image (or a few!) of what you made!</span>
				<input
					type="file"
					id="images"
					class="input"
					name="images"
					onchange={handleFileSelect}
					accept="image/png, image/jpeg"
					multiple
				/>
			</button>
			{#if filePreviewURLs.length > 0}
				<label>Thumbnail</label>
				<div class="thumbnail-picker">
					{#each filePreviewURLs as url, i}
						<label class="thumb-option">
							<input type="radio" bind:group={selectedThumbnailIndex} value={i} />
							<img src={url} alt="Upload preview" class="thumb-preview {selectedThumbnailIndex === i ? 'thumb-selected' : ''}" />
						</label>
					{/each}
				</div>
			{/if}

			<div class="submit">
				<button onclick={postObject} type="submit" class="sign-up">Post!</button>
			</div>
		</form>
	</div>
</div>

<style>
	.shareContainer {
		z-index: 102;
		padding: 50px;
		background: white;
		position: fixed;
		width: 100%;
		height: 100%;
		/* height: 200px; */
	}

	.shareForm {
		width: 50%;
		height: 75%;
		padding: 60px;
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		margin-right: -50%;
		/* box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.15); */
		min-width: 300px;
	}

	.input {
		width: 100%;
		font-size: 0.8em;
	}

	input[type='radio'] {
		accent-color: black;
	}

	input[type='file'] {
		display: none;
	}

	.file-upload {
		width: 100%;
		min-height: 30px;
		border: 1px solid #ccc;
		display: inline-block;
		margin-top: 5px;
		text-align: center;
		padding-top: 10px;
		padding-bottom: 10px;
		cursor: pointer;
	}

	.upload-text {
		font-size: 12px;
	}

	textarea {
		width: 100%;
		font-size: 0.8em;
		font-family: 'Inter', sans-serif;
	}

	label {
		font-size: 12px;
		padding-bottom: 50px;
	}

	.made {
		padding-bottom: 20px;
	}

	.submit {
		text-align: center;
		margin-top: 25px;
	}

	#info {
		height: 80px;
	}

	.thumbnail-picker {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 12px;
		margin-top: 8px;
	}

	.thumb-option {
		cursor: pointer;
		padding: 0;
	}

	.thumb-option input[type='radio'] {
		display: none;
	}

	.thumb-preview {
		width: 80px;
		height: 80px;
		object-fit: cover;
		border: 2px solid transparent;
	}

	.thumb-selected {
		border-color: black;
	}
</style>
