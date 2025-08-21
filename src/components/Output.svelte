<script>
	import { store, editorState } from '../store/state.svelte.js';
</script>

<div class="output">
	{#each editorState.output as line}
		{#if line.type === 'error'}
			<div class="error-line"><span>error</span>${line.body}</div>
		{:else if line.type === 'log'}
			<div class="output-line">
				{#if line.count > 1}
					<span>{line.count}</span>
				{/if}
				{line.body}
			</div>
		{/if}
	{/each}
</div>

<style>
	.output {
		font-family: 'Roboto Mono', monospace;
		font-size: 0.8em;
	}

	.error-line span {
		padding: 3px;
		border-radius: 5px;
		background-color: red;
		color: black;
		font-weight: 600;
		margin-right: 5px;
	}

	.output-line,
	.error-line {
		padding: 4px;
	}

	.output-line:nth-child(even) {
		background: var(--nord6);
	}

	.output-line span {
		padding: 3px;
		border-radius: 5px;
		background-color: var(--nord7);
		color: var(--nord0);
		font-weight: 600;
		margin-right: 5px;
	}
</style>
