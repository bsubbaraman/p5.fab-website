<script>
	export let images = [];

	export let overlayStart = 0;
	let current = 0;
	let overlaySize = 2; // you can change this

	const maxOverlayStart = () => Math.max(0, images.length - overlaySize);

	function wrapOverlay(n) {
		const max = maxOverlayStart();
		if (n < 0) return max; // wrap to end
		if (n > max) return 0; // wrap to start
		return n;
	}

	function next() {
		current = (current + 1) % images.length;
		overlayStart = wrapOverlay(overlayStart + 1); // move overlay every click
	}

	function prev() {
		current = (current - 1 + images.length) % images.length;
		overlayStart = wrapOverlay(overlayStart - 1);
	}

	function go(idx) {
		current = idx;
		// Ensure clicked thumb is visible inside overlay:
		if (idx < overlayStart) overlayStart = Math.min(idx, maxOverlayStart());
		else if (idx >= overlayStart + overlaySize) {
			overlayStart = Math.min(idx, maxOverlayStart());
		}
	}
</script>

<div class="thumbs-container">
	{#if images.length > 1}
		<button class="btn" on:click={prev} aria-label="Previous">◀</button>
	{/if}

	<!-- pass count so CSS repeat(var(--count)) works -->
	<div class="thumbnails" style="--count: {images.length}">
		{#each images as src, idx}
			<img
				{src}
				alt="Thumbnail {idx + 1}"
				on:click={() => go(idx)}
				class:selected={idx === current}
			/>
		{/each}

		<div class="overlay" style="--count: {images.length}">
			{#each Array(images.length) as _, idx}
				<div class:active={idx >= overlayStart && idx < overlayStart + overlaySize}></div>
			{/each}
		</div>
	</div>

	{#if images.length > 1}
		<button class="btn" on:click={next} aria-label="Next">▶</button>
	{/if}
</div>

<style>
	:root {
		--gap: 0.5rem;
		--thumb-radius: 6px;
		--overlay-color: #2563eb;
	}

	.thumbs-container {
		display: flex;
		align-items: center;
		width: min(90vw, 900px);
		gap: 0.5rem;
	}

	/* thumbnails grid: exactly one column per image (keeps overlay aligned) */
	.thumbnails {
		display: grid;
		grid-template-columns: repeat(var(--count), 1fr);
		gap: var(--gap);
		flex: 1;
		position: relative;
	}

	.thumbnails img {
		width: 100%;
		aspect-ratio: 4/3;
		object-fit: cover;
		border-radius: var(--thumb-radius);
		cursor: pointer;
		display: block;
	}

	/* overlay sits on top, using the same grid columns */
	.overlay {
		position: absolute;
		inset: 0;
		display: grid;
		grid-template-columns: repeat(var(--count), 1fr);
		gap: var(--gap);
		pointer-events: none;
		transition: transform 0.35s ease;
	}

	.overlay > div {
		border-radius: var(--thumb-radius);
		border: 2px solid transparent;
	}
	.overlay > div.active {
		border-width: 5px;
		border-color: var(--ma-orange);
		/* box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12); */
	}

	.btn {
		border: 0;
		background: rgba(0, 0, 0, 0.55);
		color: #fff;
		width: 44px;
		height: 44px;
		border-radius: 999px;
		display: grid;
		place-items: center;
		cursor: pointer;
	}
	.btn:hover {
		background: rgba(0, 0, 0, 0.75);
	}
</style>
