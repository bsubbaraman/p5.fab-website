<script>
	import { onMount } from 'svelte';
	import { MergeView, unifiedMergeView } from '@codemirror/merge';
	import { EditorView, basicSetup } from 'codemirror';
	import { EditorState } from '@codemirror/state';

	let { original, modified, mode, isLog = false } = $props();
	let originalCode = $derived(original.code);
	let originalTitle = original.name || '';
	let originalAuthor = original.username || '';
	let modifiedCode = $derived(modified.code);
	let modifiedTitle = modified.name || '';
	let modifiedAuthor = modified.username || '';

	let container = $state();
	let view;

	function createView() {
		if (view) {
			view.destroy?.(); // destroy previous view if exists
			container.innerHTML = ''; // clear container
		}

		if (mode === 'side-by-side') {
			view = new MergeView({
				a: { doc: originalCode, extensions: [basicSetup] },
				b: {
					doc: modifiedCode,
					extensions: [basicSetup, EditorView.editable.of(false), EditorState.readOnly.of(true)]
				},
				parent: container
			});
		} else {
			view = new EditorView({
				parent: container,
				doc: modified,
				extensions: [basicSetup, unifiedMergeView({ original })]
			});
		}
	}

	onMount(() => {
		createView();
	});

	$effect(() => {
		console.log('changing in here');
		createView();
	});
</script>

{#if mode === 'side-by-side'}
	<div class="merge-container">
		{#if !isLog}
			<div class="titles">
				<span><b>{originalTitle}</b> <br /><i>by {originalAuthor}</i></span>
				<span class="modified-title">
					<b>{modifiedTitle}</b>
					<i class="right-align">by {modifiedAuthor}</i>
				</span>
			</div>
		{/if}
		<div class="editor-wrapper" bind:this={container}></div>
	</div>
{:else}
	<div class="merge-container">
		<div class="titles">
			<span>{modifiedTitle} (with diff against {originalTitle})</span>
		</div>
		<div class="editor-wrapper" bind:this={container}></div>
	</div>
{/if}

<!-- <div bind:this={container} style="border:1px solid #ccc;"></div> -->

<style>
	.right-align {
		margin-left: 0;
		text-align: right;
	}
	.merge-container {
		display: flex;
		flex-direction: column;
		margin-top: 20px;
	}

	.titles {
		display: flex;
		justify-content: space-between;

		padding: 0.25rem 0.5rem;
		border-bottom: 1px solid #ccc;
		font-size: 0.9rem;
	}

	.modified-title {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
	}

	.editor-wrapper {
		flex: 1;
		height: 500px; /* Or make this flexible */
	}
</style>
