<script>
	import { editorState } from '../store/state.svelte.js';
</script>

<div class="machine-status">
	<span class="status-item">
		<span class="dot" class:connected={editorState.machineStatus.connected}></span>
		{editorState.machineStatus.connected ? 'Connected' : 'Disconnected'}
	</span>
	<span class="divider">|</span>
	<span class="status-item">
		<span class="dot" class:active={editorState.machineStatus.isPrinting}></span>
		{editorState.machineStatus.isPrinting ? 'Printing' : 'Idle'}
	</span>
</div>

<style>
	.machine-status {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0 1rem;
		height: 100%;
		font-family: var(--font-mono, monospace);
		font-size: 0.8rem;
		color: #555;
		border-top: 1px solid black;
		background: white;
	}

	.status-item {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.divider {
		color: #ccc;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #ccc;
		flex-shrink: 0;
	}

	.dot.connected,
	.dot.active {
		background: var(--ma-orange, #ff6700);
	}
</style>
