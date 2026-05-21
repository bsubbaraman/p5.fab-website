<script>
	const MACHINE_CONFIG = {
		'3D Printer': { modelLabel: '3D Printer Model', models: ['Ender 3', 'Jubilee', 'Prusa MK3'] }
		// 'Laser Cutter': { modelLabel: 'Laser Cutter Model', models: ['Epilog', 'Glowforge', 'xTool'] },
	};
	const MACHINE_TYPES = Object.keys(MACHINE_CONFIG);

	const MATERIAL_PRESETS = {
		'3D Printer': ['ABS', 'Clay', 'PETG', 'PLA', 'TPU']
	};
	const MODEL_OTHER = '__other__';

	function clickOutside(node, handler) {
		function handle(e) { if (!node.contains(e.target)) handler(); }
		document.addEventListener('click', handle, true);
		return { destroy() { document.removeEventListener('click', handle, true); } };
	}

	let {
		hasFabricated = $bindable('yes'),
		machineType = $bindable(''),
		machineModel = $bindable(''),
		materials = $bindable([]),
		namePrefix = ''
	} = $props();

	// --- Machine model ---
	const initialModels = MACHINE_CONFIG[machineType]?.models ?? [];
	let selectValue = $state(
		initialModels.includes(machineModel) ? machineModel : machineModel ? MODEL_OTHER : ''
	);
	let modelOther = $state(selectValue === MODEL_OTHER ? machineModel : '');
	let dropdownOpen = $state(false);

	function pickModel(opt) { selectValue = opt; dropdownOpen = false; }

	$effect(() => {
		machineModel = selectValue === MODEL_OTHER ? modelOther : selectValue;
	});

	// --- Materials ---
	const initialPresets = MATERIAL_PRESETS[machineType] ?? [];
	let presetSelections = $state(materials.filter((m) => initialPresets.includes(m)));
	let customMaterials = $state(materials.filter((m) => !initialPresets.includes(m)));
	let showOther = $state(customMaterials.length > 0);

	let presets = $derived(MATERIAL_PRESETS[machineType] ?? []);

	// Reset material selections when machine type changes (skip initial mount)
	let _skipFirstReset = true;
	$effect(() => {
		machineType; // reactive dependency
		if (_skipFirstReset) { _skipFirstReset = false; return; }
		presetSelections = [];
		customMaterials = [''];
		showOther = false;
	});

	// Sync internal state to parent materials prop
	$effect(() => {
		const customs = showOther ? customMaterials.filter((m) => m.trim()) : [];
		materials = [...presetSelections, ...customs];
	});

	function toggleOther() {
		showOther = !showOther;
		if (showOther && customMaterials.length === 0) customMaterials = [''];
	}
</script>

<label>Have you tried physically making this?</label>
<div class="made">
	<input bind:group={hasFabricated} name="{namePrefix}hasFabricated" type="radio" id="{namePrefix}yes" value="yes" />
	<label for="{namePrefix}yes">Yes</label><br />
	<input bind:group={hasFabricated} name="{namePrefix}hasFabricated" type="radio" id="{namePrefix}no" value="no" />
	<label for="{namePrefix}no">No</label>
</div>

{#if hasFabricated === 'yes'}
	<label>Machine type</label>
	<div class="machine-types">
		{#each MACHINE_TYPES as mt}
			<input bind:group={machineType} name="{namePrefix}machineType" type="radio" id="{namePrefix}{mt}" value={mt} />
			<label for="{namePrefix}{mt}">{mt}</label><br />
		{/each}
	</div>

	{#if machineType}
		{@const cfg = MACHINE_CONFIG[machineType]}
		<span class="field-label">{cfg.modelLabel}</span>
		<div class="select-wrapper" use:clickOutside={() => (dropdownOpen = false)}>
			<button type="button" class="trigger" onclick={() => (dropdownOpen = !dropdownOpen)}>
				<span class={selectValue ? '' : 'placeholder'}>
					{selectValue === MODEL_OTHER ? 'Other' : selectValue || '-- Select --'}
				</span>
				<i class="fa-solid fa-chevron-down"></i>
			</button>
			{#if dropdownOpen}
				<div class="dropdown">
					{#each cfg.models as m}
						<button type="button" class="dropdown-item" class:active={selectValue === m} onclick={() => pickModel(m)}>{m}</button>
					{/each}
					<button type="button" class="dropdown-item" class:active={selectValue === MODEL_OTHER} onclick={() => pickModel(MODEL_OTHER)}>Other</button>
				</div>
			{/if}
		</div>
		{#if selectValue === MODEL_OTHER}
			<input bind:value={modelOther} type="text" class="input" placeholder="Enter model name" />
		{/if}

		<span class="field-label">Material</span>
		<div class="material-checks">
			{#each presets as preset}
				<label class="check-label">
					<input type="checkbox" bind:group={presetSelections} value={preset} />
					{preset}
				</label>
			{/each}
			<label class="check-label">
				<input type="checkbox" checked={showOther} onchange={toggleOther} />
				Other
			</label>
		</div>
		{#if showOther}
			<div class="custom-materials">
				{#each customMaterials as _, i}
					<div class="custom-row">
						<input bind:value={customMaterials[i]} type="text" class="input" placeholder="Material name" />
						{#if customMaterials.length > 1}
							<button type="button" class="remove-btn" onclick={() => (customMaterials = customMaterials.filter((_, j) => j !== i))}>×</button>
						{/if}
					</div>
				{/each}
				<button type="button" class="add-btn" onclick={() => (customMaterials = [...customMaterials, ''])}>Add another</button>
			</div>
		{/if}
	{/if}
{/if}

<style>
	label,
	.field-label {
		font-size: 12px;
	}

	.field-label {
		display: block;
	}

	.made {
		margin-top: 8px;
		padding-bottom: 20px;
	}

	.machine-types {
		margin-top: 8px;
		padding-bottom: 20px;
	}

	.input {
		width: 100%;
		font-size: 0.8em;
		margin-bottom: 12px;
		display: block;
	}

	.select-wrapper {
		position: relative;
		width: 100%;
		margin-top: 8px;
		margin-bottom: 12px;
	}

	.trigger {
		width: 100%;
		box-sizing: border-box;
		text-align: left;
		padding: 5px 8px;
		border-radius: 0;
		border: 1px solid black;
		background: white;
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-family: 'Inter', sans-serif;
		font-size: 0.8em;
	}

	.trigger:hover {
		background: white;
	}

	.placeholder {
		color: #999;
	}

	.dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		z-index: 50;
		background: white;
		border: 1px solid black;
		border-top: none;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.dropdown-item {
		display: block;
		width: 100%;
		text-align: left;
		padding: 6px 8px;
		border: none;
		border-radius: 0;
		background: white;
		font-size: 0.8em;
		font-family: 'Inter', sans-serif;
		cursor: pointer;
	}

	.dropdown-item:hover,
	.dropdown-item.active {
		background: var(--ma-orange);
	}

	.material-checks {
		margin-top: 8px;
		padding-bottom: 8px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.check-label {
		display: flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
	}

	.custom-materials {
		padding-bottom: 12px;
	}

	.custom-row {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 4px;
	}

	.custom-row .input {
		margin-bottom: 0;
		flex: 1;
	}

	.remove-btn {
		padding: 2px 7px;
		font-size: 14px;
		flex-shrink: 0;
	}

	.add-btn {
		font-size: 12px;
		padding: 3px 10px;
		margin-top: 8px;
	}
</style>
