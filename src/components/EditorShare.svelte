<script>
	import imageCompression from 'browser-image-compression';
	import { editorState, store } from '../store/state.svelte.js';
	import { db, storage } from '../dbConfig.js';
	import { getUserData } from '$lib/dbLoadSave.js';
	import { getDoc, doc, collection, addDoc, updateDoc, arrayUnion } from 'firebase/firestore';
	import { ref, uploadBytes, uploadString, getDownloadURL } from 'firebase/storage';
	import ImagePicker from './ImagePicker.svelte';
	import MachineFields from './MachineFields.svelte';
	import { requestIframeScreenshot } from '$lib/screenshot.js';

	const COMPRESSION_OPTIONS = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true };

	let objectInfo = $state('');
	let hasFabricated = $state('yes');
	let machineType = $state('');
	let machineModel = $state('');
	let materials = $state([]);
	let items = $state([]);
	let selectedIndex = $state(0);
	let isSubmitting = $state(false);

	function toggleSavePane() {
		editorState.displaySaveScreen = !editorState.displaySaveScreen;
	}

	async function postObject(event) {
		event.preventDefault();
		if (isSubmitting) return;
		isSubmitting = true;

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
				...(hasFabricated === 'yes' && {
					machineType: machineType || null,
					machineModel: machineModel || null,
					materials: materials.length ? materials : null
				}),
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
			if (items.length > 0) {
				// Compress and upload user-provided images
				for (const item of items) {
					const compressed = await imageCompression(item.file, COMPRESSION_OPTIONS);
					const storageRef = ref(storage, objectID + '/' + item.file.name);
					await uploadBytes(storageRef, compressed);
					const downloadURL = await getDownloadURL(storageRef);
					fileURLs.push(downloadURL);
				}
			} else {
				// Take a compressed JPEG screenshot for the thumbnail
				const iframe = document.getElementById('preview');
				const dataURL = await requestIframeScreenshot(iframe);
				if (!dataURL) {
					console.warn('Canvas not found in iframe.');
					return;
				}
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
				thumbnail: fileURLs[selectedIndex] ?? fileURLs[0] ?? null
			});

			// Add to the user's posts
			await updateDoc(userRef, {
				posts: arrayUnion(objectID)
			});

			// A fork is identified solely by its own parentSketch link (set above). We no
			// longer write the fork into the parent post's forks/numForks array — that was a
			// cross-user write any signed-in user could abuse to bloat or spoof someone
			// else's post. The post page derives forks via where('parentSketch','==',id).

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
			isSubmitting = false;
		}
	}
</script>

<div class="shareContainer">
	<div class="card-content shadow nohover shareForm">
		<button aria-label="Close" onclick={toggleSavePane} class="close">
			<i class="fa-solid fa-x"></i>
		</button>
		<h2>Post to p5.fab</h2>
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
			<MachineFields bind:hasFabricated bind:machineType bind:machineModel bind:materials namePrefix="" />
			<label>Files</label>
			<ImagePicker bind:items bind:selectedIndex />

			<div class="submit">
				<button onclick={postObject} type="button" class="sign-up" disabled={isSubmitting || !objectInfo}>{isSubmitting ? 'Posting...' : 'Post!'}</button>
			</div>
		</form>
	</div>
</div>

<style>
	.shareContainer {
		z-index: 102;
		position: fixed;
		inset: 0;
		background: white;
		display: flex;
		flex-direction: column;
		align-items: center;
		overflow-y: auto;
		padding: 50px;
		box-sizing: border-box;
	}

	.shareForm {
		width: 50%;
		min-width: 300px;
	}

	.input {
		width: 100%;
		font-size: 0.8em;
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

	.submit {
		text-align: center;
		margin-top: 25px;
	}

	#info {
		height: 80px;
	}
</style>
