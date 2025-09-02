<script>
	import { editorState, store } from '../store/state.svelte.js';
	import { db, storage } from '../dbConfig.js';
	import { getUserData } from '$lib/dbLoadSave.js';
	import { getDoc, doc, collection, addDoc, updateDoc, arrayUnion } from 'firebase/firestore';
	import { ref, uploadBytes, uploadString, getDownloadURL } from 'firebase/storage';
	import Editor from './Editor.svelte';

	let changeLog = $state('');
	let files;

	function toggleLogPane() {
		editorState.displayLogScreen = !editorState.displayLogScreen;
	}

	function uploadImages() {
		document.getElementById('images').click();
	}

	function handleFileSelect(e) {
		if (!e.target.files) return;
		files = e.target.files;
		var selectedFiles = document.getElementById('selectedFiles');
		for (var i = 0; i < files.length; i++) {
			var f = files[i];
			console.log(f);
			selectedFiles.innerHTML += f.name + '<br/>';
		}
	}

	async function postLog(event) {
		event.preventDefault();

		try {
			if (!changeLog) {
				alert('Add some info about what you changed!');
				return;
			}

			const docRef = doc(db, 'posts', editorState.currentObjectID);
			const timeAdded = new Date();

			// Upload images to storage
			var fileURLs = [];
			if (files) {
				// Add user provided files to storage
				for (var i = 0; i < files.length; i++) {
					var f = files[i];
					const storageRef = ref(storage, editorState.currentObjectID + '/' + f.name);
					await uploadBytes(storageRef, f);
					const downloadURL = await getDownloadURL(storageRef);
					fileURLs.push(downloadURL);
				}
			} else {
				// if no files were uploaded, take a screenshot for the thumbnail
				const iframe = document.getElementById('preview');
				const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
				const canvas = iframeDoc.querySelector('canvas');
				if (!canvas) {
					console.warn('Canvas not found in iframe.');
					return;
				}
				const dataURL = canvas.toDataURL('image/png');
				try {
					const storageRef = ref(storage, editorState.currentObjectID + '/' + Date.now());
					await uploadString(storageRef, dataURL, 'data_url');
					const downloadURL = await getDownloadURL(storageRef);
					fileURLs.push(downloadURL);
				} catch (e) {
					console.log(e);
				}
			}

			const projectLogData = {
				code: editorState.globalSketch,
				changeLog: changeLog,
				added: timeAdded,
				files: fileURLs
			};

			await updateDoc(docRef, {
				projectLog: arrayUnion(projectLogData)
			});

			editorState.displayLogScreen = false;
		} catch (err) {
			alert(err);
		}
	}
</script>

<div class="shareContainer">
	<div class="shareForm">
		<button aria-label="Close" onclick={toggleLogPane} class="close">
			<i class="fa-solid fa-x"></i>
		</button>
		<form>
			<label for="info">Change Log</label>
			<textarea
				bind:value={changeLog}
				type="text"
				class="input"
				id="info"
				placeholder="What did you change or test in this iteration? How did it go?"
				required
			></textarea>
			<label for="images">Files</label>
			<button class="file-upload" onclick={uploadImages}>
				<i class="fa-solid fa-upload"></i><br />
				<span class="upload-text">Upload an image (or a few!) of what you made!</span>
				<input
					type="file"
					id="images"
					class="input"
					name="images"
					onchange={handleFileSelect}
					accept="image/png, image/jpeg, .js"
					multiple
				/>
				<div id="selectedFiles"></div>
			</button>

			<div class="submit">
				<button onclick={postLog} type="submit" class="sign-up">Add to Log!</button>
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

	#selectedFiles {
		text-align: left;
		margin-left: 10px;
		font-size: 12px;
	}
</style>
