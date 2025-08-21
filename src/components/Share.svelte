<script>
	import { store } from '../store/state.svelte.js';
	import { db, storage } from '../dbConfig';
	import { getDoc, doc, collection, addDoc, updateDoc } from 'firebase/firestore';
	import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

	let objectName = $state('');
	let objectInfo = $state('');
	let hasFabricated = $state('yes');
	let files;

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

	async function postObject() {
		try {
			if (!objectName) {
				alert('Give your object a name!');
				return;
			} else if (!objectInfo) {
				alert('Add some info about your object!');
				return;
			} else if (!files) {
				alert('Your upload must include at least 1 file!');
				return;
			}

			// Get the username by uid
			const uid = store.user.uid;
			const userRef = doc(db, 'users', uid);
			const docSnap = await getDoc(userRef);
			const userData = docSnap.data();
			const username = userData.username;
			var fileNames = [];
			var fileURLs = [];
			for (var i = 0; i < files.length; i++) {
				var f = files[i];
				fileNames.push(f.name);
			}

			const dataToPost = {
				name: objectName,
				info: objectInfo,
				hasFabricated: hasFabricated,
				user: uid,
				username: username,
				favorites: 0,
				forks: 0,
				created: new Date(),
				modified: null
			};
			const docRef = await addDoc(collection(db, 'posts'), dataToPost);
			const objectID = docRef.id;

			// Add files to storage
			for (var i = 0; i < files.length; i++) {
				var f = files[i];
				const storageRef = ref(storage, objectID + '/' + f.name);
				await uploadBytes(storageRef, f);
				const downloadURL = await getDownloadURL(storageRef);
				fileURLs.push(downloadURL);
			}

			await updateDoc(docRef, {
				files: fileURLs
			});

			// Add to the user's posts
			var posts = userData.posts;
			const numPosts = Object.keys(posts).length;
			posts[numPosts] = objectID;
			await updateDoc(userRef, {
				posts: posts
			});

			// Add to list of all posts
			const allPostsRef = doc(db, 'posts', 'allPosts');
			const dataForFeed = {
				name: objectName,
				hasFabricated: hasFabricated,
				user: uid,
				username: username,
				created: new Date(),
				thumbnail: fileURLs[0]
			};
			await updateDoc(allPostsRef, {
				[objectID]: dataForFeed
			});

			// Open the new Fab page
			window.location.href = `/fabs/${objectID}`;
		} catch (err) {
			alert(err);
		}
	}
</script>

<div class="page-container card">
	<h1>Share</h1>
	{#if !store.user}
		Login to upload!
	{:else}
		<div class="card-content shadow">
			<form>
				<label for="title">Name</label>
				<input
					bind:value={objectName}
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
					<input
						bind:group={hasFabricated}
						name="hasFabricated"
						type="radio"
						id="yes"
						value="yes"
					/>
					<label for="yes">Yes</label><br />
					<input bind:group={hasFabricated} name="hasFabricated" type="radio" id="no" value="no" />
					<label for="no">No</label>
				</div>
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
					<button onclick={postObject} type="submit" class="sign-up">Post!</button>
				</div>
			</form>
		</div>
	{/if}
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

	#info {
		height: 80px;
	}

	#selectedFiles {
		text-align: left;
		margin-left: 10px;
		font-size: 12px;
	}
</style>
