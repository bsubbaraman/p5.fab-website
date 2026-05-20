<script>
	import { editorState } from '../store/state.svelte.js';

	let editingField = $state(null);
	let editValue = $state('');

	const hasConfig = $derived(editorState.machineStatus.nozzleDiameter !== null);
	let showConfig = $state(false);

	const canEdit = $derived(
		editorState.machineStatus.connected && !editorState.machineStatus.isPrinting
	);

	const printingHint = $derived(
		editorState.machineStatus.isPrinting ? 'Only editable when idle' : undefined
	);

	function sendGcode(gcode) {
		const iframe = document.getElementById('preview');
		if (iframe) iframe.contentWindow.postMessage({ type: 'fab_command', body: { gcode } }, '*');
	}

	function startEdit(field) {
		if (!canEdit) return;
		editingField = field;
		if (field === 'nozzle') editValue = editorState.machineStatus.nozzleTemp?.toFixed(2) ?? '';
		else if (field === 'bed') editValue = editorState.machineStatus.bedTemp?.toFixed(2) ?? '';
		else if (field === 'x') editValue = editorState.machineStatus.x?.toFixed(2) ?? '0';
		else if (field === 'y') editValue = editorState.machineStatus.y?.toFixed(2) ?? '0';
		else if (field === 'z') editValue = editorState.machineStatus.z?.toFixed(2) ?? '0';
	}

	function submitEdit() {
		if (editingField === 'nozzle') {
			const t = parseFloat(editValue);
			if (!isNaN(t)) sendGcode(`M104 S${t}`);
		} else if (editingField === 'bed') {
			const t = parseFloat(editValue);
			if (!isNaN(t)) sendGcode(`M140 S${t}`);
		} else if (editingField === 'x') {
			const v = parseFloat(editValue);
			if (!isNaN(v)) sendGcode(`G0 X${v}`);
		} else if (editingField === 'y') {
			const v = parseFloat(editValue);
			if (!isNaN(v)) sendGcode(`G0 Y${v}`);
		} else if (editingField === 'z') {
			const v = parseFloat(editValue);
			if (!isNaN(v)) sendGcode(`G0 Z${v}`);
		}
		editingField = null;
	}

	function handleKeydown(e) {
		if (e.key === 'Enter') {
			e.stopPropagation();
			submitEdit();
		}
		if (e.key === 'Escape') {
			e.stopPropagation();
			editingField = null;
		}
	}

	function focusOnMount(node) {
		node.focus();
		node.select();
	}
</script>

<div class="machine-status">
	<span class="status-item">
		<span class="dot" class:active={editorState.machineStatus.connected}></span>
		{editorState.machineStatus.connected ? 'Connected' : 'Disconnected'}
	</span>
	<span class="divider">|</span>
	<span class="status-item">
		<span class="dot" class:active={editorState.machineStatus.isPrinting}></span>
		{editorState.machineStatus.isPrinting ? 'Printing' : 'Idle'}
	</span>
	{#if editorState.machineStatus.nozzleTemp !== null}
		<span class="divider">|</span>
		<span
			class="status-item"
			class:editable={canEdit}
			class:printing={!canEdit}
			data-tooltip={printingHint}
			role="button"
			tabindex={canEdit ? 0 : -1}
			onclick={() => startEdit('nozzle')}
			onkeydown={(e) => e.key === 'Enter' && startEdit('nozzle')}
		>
			{#if editingField === 'nozzle'}
				T <input
					class="edit-input"
					bind:value={editValue}
					onkeydown={handleKeydown}
					onblur={() => (editingField = null)}
					use:focusOnMount
				/>°C
			{:else}
				T {editorState.machineStatus.nozzleTemp.toFixed(2)}°C
			{/if}
		</span>
	{/if}
	{#if editorState.machineStatus.bedTemp !== null}
		<span class="divider">|</span>
		<span
			class="status-item"
			class:editable={canEdit}
			class:printing={!canEdit}
			data-tooltip={printingHint}
			role="button"
			tabindex={canEdit ? 0 : -1}
			onclick={() => startEdit('bed')}
			onkeydown={(e) => e.key === 'Enter' && startEdit('bed')}
		>
			{#if editingField === 'bed'}
				B <input
					class="edit-input"
					bind:value={editValue}
					onkeydown={handleKeydown}
					onblur={() => (editingField = null)}
					use:focusOnMount
				/>°C
			{:else}
				B {editorState.machineStatus.bedTemp.toFixed(2)}°C
			{/if}
		</span>
	{/if}
	{#if editorState.machineStatus.x !== null}
		<span class="divider">|</span>
		<span class="status-item pos">
			{#each [['x', 'X'], ['y', 'Y'], ['z', 'Z']] as [field, label]}
				<span
					class:editable={canEdit}
					class:printing={!canEdit}
					data-tooltip={printingHint}
					role="button"
					tabindex={canEdit ? 0 : -1}
					onclick={() => startEdit(field)}
					onkeydown={(e) => e.key === 'Enter' && startEdit(field)}
				>
					{#if editingField === field}
						{label}<input
							class="edit-input"
							bind:value={editValue}
							onkeydown={handleKeydown}
							onblur={() => (editingField = null)}
							use:focusOnMount
						/>
					{:else}
						{label}{editorState.machineStatus[field]?.toFixed(2)}
					{/if}
				</span>
			{/each}
		</span>
	{/if}
	{#if hasConfig}
		<span
			class="config-icon"
			role="tooltip"
			onmouseenter={() => (showConfig = true)}
			onmouseleave={() => (showConfig = false)}
		>
			ⓘ
			{#if showConfig}
				<div class="config-popover">
					{#if editorState.machineStatus.printerName !== null}
						<div>Printer: {editorState.machineStatus.printerName}</div>
					{/if}
					<div>Nozzle: {editorState.machineStatus.nozzleDiameter}mm</div>
					<div>Filament: {editorState.machineStatus.filamentDiameter}mm</div>
					<div>Build: {editorState.machineStatus.maxX} × {editorState.machineStatus.maxY} × {editorState.machineStatus.maxZ}mm</div>
				</div>
			{/if}
		</span>
	{/if}
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

	.pos {
		gap: 0.6rem;
	}

	.status-item.editable,
	.editable {
		cursor: pointer;
	}

	.status-item.editable:hover,
	.editable:hover {
		color: #222;
		text-decoration: underline;
	}

	.status-item.printing,
	.printing {
		cursor: not-allowed;
	}

	[data-tooltip] {
		position: relative;
	}

	[data-tooltip]:hover::before {
		content: attr(data-tooltip);
		position: absolute;
		bottom: calc(100% + 6px);
		left: 50%;
		transform: translateX(-50%);
		background: #333;
		color: white;
		padding: 2px 8px;
		border-radius: 3px;
		white-space: nowrap;
		font-size: 0.75rem;
		pointer-events: none;
		z-index: 100;
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

	.dot.active {
		background: var(--ma-orange, #ff6700);
	}

	.edit-input {
		font-family: inherit;
		font-size: inherit;
		color: inherit;
		width: 7ch;
		border: none;
		border-bottom: 1px solid #555;
		background: transparent;
		outline: none;
		padding: 0;
		text-align: right;
	}

	.config-icon {
		position: relative;
		margin-left: auto;
		cursor: default;
		color: #999;
		font-size: 0.85rem;
		user-select: none;
	}

	.config-icon:hover {
		color: #333;
	}

	.config-popover {
		position: absolute;
		bottom: calc(100% + 6px);
		right: 0;
		background: white;
		border: 1px solid black;
		box-shadow: 4px 4px var(--ma-orange);
		padding: 0.5rem 0.75rem;
		white-space: nowrap;
		font-size: 0.8rem;
		line-height: 1.6;
		z-index: 100;
		pointer-events: none;
	}
</style>
