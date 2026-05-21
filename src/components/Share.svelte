<script>
	import imageCompression from 'browser-image-compression';
	import { db, storage } from '../dbConfig';
	import { doc, updateDoc } from 'firebase/firestore';
	import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
	import ImagePicker from './ImagePicker.svelte';
	import MachineFields from './MachineFields.svelte';

	const COMPRESSION_OPTIONS = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true };

	let { displayShareScreen = $bindable(), postData, objectID, onSaved } = $props();
	let objectName = $state(postData.name);
	let objectInfo = $state(postData.info);
	let hasFabricated = $state(postData.hasFabricated);
	let machineType = $state(postData.machineType ?? '');
	let machineModel = $state(postData.machineModel ?? '');
	let materials = $state(postData.materials ?? []);

	const initialFileURLs = new Set(postData.files ?? []);
	let items = $state((postData.files ?? []).map((url) => ({ url, file: null })));
	const currentThumbnail = postData.thumbnail ?? postData.files?.[0] ?? null;
	let selectedIndex = $state(Math.max(0, (postData.files ?? []).indexOf(currentThumbnail)));

	function toggleShareScreen() {
		displayShareScreen = !displayShareScreen;
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
				machineType: hasFabricated === 'yes' ? (machineType || null) : null,
				machineModel: hasFabricated === 'yes' ? (machineModel || null) : null,
				materials: hasFabricated === 'yes' ? (materials.length ? materials : null) : null,
				modified: new Date()
			};

			// Delete any existing Storage files the user removed
			const currentURLs = new Set(items.filter((p) => !p.file).map((p) => p.url));
			await Promise.all(
				[...initialFileURLs]
					.filter((url) => !currentURLs.has(url))
					.map((url) => deleteObject(ref(storage, url)).catch(() => {}))
			);

			// Upload any new files and resolve their final URLs
			const resolved = await Promise.all(
				items.map(async (p) => {
					if (!p.file) return p.url;
					const compressed = await imageCompression(p.file, COMPRESSION_OPTIONS);
					const storageRef = ref(storage, objectID + '/' + p.file.name);
					await uploadBytes(storageRef, compressed);
					return await getDownloadURL(storageRef);
				})
			);

			// Put the selected thumbnail first in the files array
			updates.files = [resolved[selectedIndex], ...resolved.filter((_, i) => i !== selectedIndex)];
			updates.thumbnail = resolved[selectedIndex];

			await updateDoc(docRef, updates);
			displayShareScreen = false;
			if (onSaved) onSaved(updates);
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
		<MachineFields bind:hasFabricated bind:machineType bind:machineModel bind:materials namePrefix="share-" />
		<label>Images</label>
		<ImagePicker bind:items bind:selectedIndex minItems={1} />
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

	#share-info {
		height: 80px;
	}
</style>
