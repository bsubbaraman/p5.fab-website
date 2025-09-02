<script>
	import { onMount } from 'svelte';

	export let images = [];

	export let current = 0;

	function next() {
		current = (current + 1) % images.length;
	}

	function prev() {
		current = (current - 1 + images.length) % images.length;
	}

	function go(idx) {
		current = idx;
	}
</script>

<div
	class="gallery"
	tabindex="0"
	on:keydown={(e) => {
		if (e.key === 'ArrowRight' && images.length > 1) next();
		if (e.key === 'ArrowLeft' && images.length > 1) prev();
	}}
>
	<img src={images[current]} alt="Gallery image" />

	{#if images.length > 1}
		<div class="controls">
			<button class="btn" on:click={prev}>◀</button>
			<button class="btn" on:click={next}>▶</button>
		</div>

		<div class="dots">
			{#each images as _, idx}
				<span class="dot {idx === current ? 'active' : ''}" on:click={() => go(idx)}></span>
			{/each}
		</div>
	{/if}
</div>

<style>
	:root {
		--btn-bg: rgba(0, 0, 0, 0.55);
		--btn-bg-hover: rgba(0, 0, 0, 0.75);
		--btn-fg: #fff;
		--radius: 14px;
	}
	.gallery {
		width: min(25vw, 900px);
		aspect-ratio: 16 / 10;
		position: relative;
		overflow: hidden;
		/* border-radius: var(--radius); */
		background: #fff; /* white background when using contain */
		border: 1px solid black;
		box-shadow: 7px 7px black;
	}
	img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: block;
		user-select: none;
		transition: opacity 0.25s ease;
	}
	.controls {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem;
		pointer-events: none;
	}
	.btn {
		pointer-events: auto;
		border: 0;
		background: var(--btn-bg);
		color: var(--btn-fg);
		width: 44px;
		height: 44px;
		border-radius: 999px;
		display: grid;
		place-items: center;
		cursor: pointer;
		outline: none;
	}
	.btn:hover {
		background: var(--btn-bg-hover);
	}
	.btn:focus-visible {
		box-shadow: 0 0 0 3px #93c5fd;
	}

	.dots {
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		bottom: 0.65rem;
		display: flex;
		gap: 0.4rem;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.35);
		cursor: pointer;
	}
	.dot.active {
		background: #000;
	}
</style>
