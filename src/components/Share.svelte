<script>
	import imageCompression from 'browser-image-compression';
	import { db, storage } from '../dbConfig';
	import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
	import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

	const MAX_FILES = 5;
	const COMPRESSION_OPTIONS = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true };

	let { displayShareScreen = $bindable(), postData, objectID, onSaved } = $props();
	let objectName = $state(postData.name);
	let objectInfo = $state(postData.info);
	let hasFabricated = $state(postData.hasFabricated);

	// Combined list of existing + newly selected images for the picker
	// Each entry: { url, file? } — file is set only for new uploads (not yet in storage)
	let allPreviews = $state(
		(postData.files ?? []).map((url) => ({ url, file: null }))
	);
	const currentThumbnail = postData.thumbnail ?? postData.files?.[0] ?? null;
	let selectedIndex = $state(
		Math.max(0, allPreviews.findIndex((p) => p.url === currentThumbnail))
	);

	function toggleShareScreen() {
		displayShareScreen = !displayShareScreen;
	}

	function uploadImages() {
		document.getElementById('share-images').click();
	}

	function handleFileSelect(e) {
		if (!e.target.files) return;
		const newFiles = Array.from(e.target.files);
		if (allPreviews.length + newFiles.length > MAX_FILES) {
			alert(`Max ${MAX_FILES} images per post.`);
			e.target.value = '';
			return;
		}
		const newPreviews = newFiles.map((file) => ({
			url: URL.createObjectURL(file),
			file
		}));
		allPreviews = [...allPreviews, ...newPreviews];
	}

	async function saveEdit() {
		try {
			if (!objectName) {
				alert('Give your object a name!');
				return;
			} else if (!objectInfo) {
				alert('Add some info about your object!');
				return;
			}

			const docRef = doc(db, 'posts', objectID);
			const updates = {
				name: objectName,
				info: objectInfo,
				hasFabricated: hasFabricated,
				modified: new Date()
			};

			// Upload any new files and resolve their final URLs
			const resolved = await Promise.all(
				allPreviews.map(async (p) => {
					if (!p.file) return p.url;
					const compressed = await imageCompression(p.file, COMPRESSION_OPTIONS);
					const storageRef = ref(storage, objectID + '/' + p.file.name);
					await uploadBytes(storageRef, compressed);
					return await getDownloadURL(storageRef);
				})
			);

			const newURLs = resolved.filter((url, i) => allPreviews[i].file !== null);
			if (newURLs.length > 0) {
				updates.files = arrayUnion(...newURLs);
			}
			updates.thumbnail = resolved[selectedIndex];

			await updateDoc(docRef, updates);
			displayShareScreen = false;
			if (onSaved) onSaved();
		} catch (err) {
			alert(err);
		}
	}
</script>

<div class="card-content shadow nohover">
	<button aria-label="Close" onclick={toggleShareScreen} class="close">
		<i class="fa-solid fa-x"></i>
	</button>
	<h2>Edit Post</h2>
	<form>
		<label for="share-title">Name</label>
		<input
			bind:value={objectName}
			type="text"
			class="input"
			id="share-title"
			placeholder="Enter a name for your work!"
			required
		/>
		<label for="share-info">Info</label>
		<textarea
			bind:value={objectInfo}
			class="input"
			id="share-info"
			placeholder="Tell everyone about what you made!"
			required
		></textarea>
		<label>Have you tried physically making this?</label>
		<div class="made">
			<input bind:group={hasFabricated} name="share-hasFabricated" type="radio" id="share-yes" value="yes" />
			<label for="share-yes">Yes</label><br />
			<input bind:group={hasFabricated} name="share-hasFabricated" type="radio" id="share-no" value="no" />
			<label for="share-no">No</label>
		</div>
		<label for="share-images">Images</label>
		<button class="file-upload" type="button" onclick={uploadImages}>
			<i class="fa-solid fa-upload"></i><br />
			<span class="upload-text">Upload more images</span>
			<input
				type="file"
				id="share-images"
				class="input"
				name="share-images"
				onchange={handleFileSelect}
				accept="image/png, image/jpeg"
				multiple
			/>
		</button>
		{#if allPreviews.length > 0}
			<label>Thumbnail — click to select</label>
			<div class="thumbnail-picker">
				{#each allPreviews as preview, i}
					<label class="thumb-option">
						<input type="radio" bind:group={selectedIndex} value={i} />
						<img
							src={preview.url}
							alt="Post image"
							class="thumb-preview {selectedIndex === i ? 'thumb-selected' : ''}"
						/>
					</label>
				{/each}
			</div>
		{/if}
		<div class="submit">
			<button onclick={saveEdit} type="submit" class="sign-up">Save</button>
		</div>
	</form>
</div>

<style>
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

	#share-info {
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
