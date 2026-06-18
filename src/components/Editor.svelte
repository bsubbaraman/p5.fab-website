<script>
	import { onMount } from 'svelte';
	import { editorState } from '../store/state.svelte.js';
	import { templateSketch } from '$lib/examples/examples';
	import { evalSketch } from '$lib/repl.js';
	import { clearErrorHighlight } from '$lib/errorHighlight.js';
	import { setupMessages } from '$lib/setupMessages.js';
	import { keymap, EditorView } from '@codemirror/view';
	import { javascript } from '@codemirror/lang-javascript';
	import { acceptCompletion, completionStatus } from '@codemirror/autocomplete';
	import { indentWithTab, indentMore, indentLess } from '@codemirror/commands';
	import { Prec } from '@codemirror/state';
	import CodeMirror from 'svelte-codemirror-editor';

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
					if (!completionStatus(e.state)) {
						const sel = e.state.selection.main;
						const isMultiLine =
							e.state.doc.lineAt(sel.from).number !== e.state.doc.lineAt(sel.to).number;
						const isAtLineStart =
							sel.empty && sel.from === e.state.doc.lineAt(sel.from).from;
						if (isMultiLine || isAtLineStart) return indentMore(e);
						e.dispatch(e.state.replaceSelection('\t'));
						return true;
					}
					return acceptCompletion(e);
				}
			}
		])
	);

	// Bump the run id the instant the document changes (the editor's on:change is debounced
	// 300ms, too slow): this invalidates error messages still arriving from the previous run,
	// so a now-stale line number can't be (re-)highlighted while the user types.
	const trackEdits = EditorView.updateListener.of((update) => {
		if (update.docChanged) editorState.runId++;
	});

	const customExtensions = [keybindings, trackEdits];

	function onEditorChange() {
		clearErrorHighlight(editorState.editorView);
		if (editorState.saved) {
			editorState.saved = false;
			const saveButton = document.getElementById('sketchSaveBtn');
			saveButton.disabled = false;
		}
	}

	let webSerialSupported = $state(true);

	onMount(() => {
		// setupMessages();
		webSerialSupported = 'serial' in navigator;
	});
</script>

{#if !webSerialSupported}
	<div class="webserial-overlay">
		<div class="webserial-modal">
			<p>
				Connecting to a machine with p5.fab requires <a
					href="https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API#browser_compatibility"
					target="_blank"
					rel="noopener noreferrer">WebSerial</a
				>, which isn't supported in your browser. Try Chrome or Edge to connect to a printer.
				<br /> <br />
				You can still edit code and save g-code from this browser.
			</p>
			<button onclick={() => (webSerialSupported = true)}>Dismiss</button>
		</div>
	</div>
{/if}

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

	.webserial-overlay {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.webserial-modal {
		background: white;
		border: 1px solid black;
		box-shadow: 7px 7px var(--ma-orange);
		padding: 2em;
		max-width: 360px;
		text-align: left;
		font-family: 'Inter', sans-serif;
	}

	.webserial-modal p {
		margin: 0 0 1.25em;
		font-size: 1em;
		line-height: 1.5;
	}

	.webserial-modal a {
		text-decoration: underline;
		text-decoration-color: var(--ma-orange);
		text-decoration-thickness: 2px;
	}
</style>
