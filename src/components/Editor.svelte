<script>
	import { onMount } from 'svelte';
	import { editorState } from '../store/state.svelte.js';
	import { templateSketch } from '$lib/examples/examples';
	import { evalSketch } from '$lib/repl.js';
	import { setupMessages } from '$lib/setupMessages.js';
	import { keymap } from '@codemirror/view';
	import { javascript } from '@codemirror/lang-javascript';
	import { acceptCompletion, completionStatus } from '@codemirror/autocomplete';
	import { indentWithTab, indentMore, indentLess } from '@codemirror/commands';
	import { Prec } from '@codemirror/state';
	import CodeMirror from 'svelte-codemirror-editor';

	editorState.globalSketch = templateSketch;

	// Setup keybindings
	// Use Prec.highest to override default keybindings
	// https://discuss.codemirror.net/t/overriding-certain-default-keymaps/6181
	const keybindings = Prec.highest(
		keymap.of([
			{
				key: 'Shift-Enter',
				preventDefault: true,
				run: () => {
					evalSketch(editorState.globalSketch);
					return true;
				}
			},
			{
				key: 'Tab',
				preventDefault: true,
				shift: indentLess,
				run: (e) => {
					if (!completionStatus(e.state)) return indentMore(e);
					return acceptCompletion(e);
				}
			}
		])
	);
	const customExtensions = [keybindings];

	function onEditorChange() {
		if (editorState.saved) {
			editorState.saved = false;
			const saveButton = document.getElementById('sketchSaveBtn');
			saveButton.disabled = false;
		}
	}

	onMount(() => {
		// setupMessages();
	});
</script>

<CodeMirror
	on:ready={(e) => (editorState.editorView = e.detail)}
	on:change={onEditorChange}
	bind:value={editorState.globalSketch}
	extensions={customExtensions}
	lang={javascript()}
	styles={{
		'&': {
			width: '100%',
			maxWidth: '100%',
			height: '100%',
			maxHeight: '100%'
		}
	}}
/>

<style>
	/* CodeMirror styles have to be in app.css to take effect */
</style>
