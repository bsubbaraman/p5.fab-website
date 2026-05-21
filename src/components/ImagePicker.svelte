<script>
	const MAX_FILES = 5;

	let { items = $bindable([]), selectedIndex = $bindable(0), minItems = 0 } = $props();
	let inputEl = $state();

	function uploadImages() {
		inputEl.click();
	}

	function handleFileSelect(e) {
		if (!e.target.files) return;
		const newFiles = Array.from(e.target.files);
		if (items.length + newFiles.length > MAX_FILES) {
			alert(`Max ${MAX_FILES} images per post.`);
			e.target.value = '';
			return;
		}
		items = [...items, ...newFiles.map((file) => ({ url: URL.createObjectURL(file), file }))];
		e.target.value = '';
	}

	function removeImage(i) {
		if (items[i].file) URL.revokeObjectURL(items[i].url);
		items = items.filter((_, idx) => idx !== i);
		if (selectedIndex >= items.length) {
			selectedIndex = Math.max(0, items.length - 1);
		} else if (selectedIndex > i) {
			selectedIndex -= 1;
		}
	}
</script>

<button class="file-upload" type="button" onclick={uploadImages}>
	<i class="fa-solid fa-upload"></i><br />
	<span class="upload-text">Upload images</span>
	<input
		bind:this={inputEl}
		type="file"
		class="hidden-input"
		onchange={handleFileSelect}
		accept="image/png, image/jpeg"
		multiple
	/>
</button>

{#if items.length > 0}
	<label>Thumbnail — click to select</label>
	<div class="thumbnail-picker">
		{#each items as item, i}
			<div class="thumb-wrapper">
				<label class="thumb-option">
					<input type="radio" bind:group={selectedIndex} value={i} />
					<img
						src={item.url}
						alt="Upload preview"
						class="thumb-preview {selectedIndex === i ? 'thumb-selected' : ''}"
					/>
				</label>
				{#if items.length > minItems}
				<button type="button" class="thumb-remove" onclick={() => removeImage(i)}>
					<i class="fa-solid fa-x"></i>
				</button>
			{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	.hidden-input {
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
		background-color: transparent;
		border-radius: 0;
	}

	.file-upload:hover {
		background-color: #ff6700;
	}

	.upload-text {
		font-size: 12px;
	}

	label {
		font-size: 12px;
	}

	.thumbnail-picker {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 12px;
		margin-top: 8px;
	}

	.thumb-wrapper {
		position: relative;
		display: inline-block;
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
		display: block;
	}

	.thumb-selected {
		border-color: black;
	}

	.thumb-remove {
		position: absolute;
		top: 2px;
		right: 2px;
		width: 18px;
		height: 18px;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.55);
		color: white;
		font-size: 8px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.thumb-remove:hover {
		background: rgba(0, 0, 0, 0.85);
	}
</style>
