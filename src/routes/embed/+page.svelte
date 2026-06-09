<script>
	import { onMount } from 'svelte';
	import CodeMirror from 'svelte-codemirror-editor';
	import { javascript } from '@codemirror/lang-javascript';
	import { keymap } from '@codemirror/view';
	import { Prec } from '@codemirror/state';
	import { templateSketch } from '$lib/examples/examples';
	import { flashCode } from '$lib/flash.js';
	import { evalPrefix } from '$lib/evalPrefix.js';

	let code = $state('');
	let editorView = null;
	let codeLoaded = $state(false);
	let initIframe = $state(false);
	let output = $state([]);
	let originalCode = $state('');
	let copied = $state(false);

	/** @type {HTMLIFrameElement | null} */
	let previewFrame = null;
	let p5Initialized = false;

	function postToPreview(evalCode) {
		previewFrame?.contentWindow?.postMessage({ type: 'eval', code: evalCode }, '*');
	}

	function runCode() {
		if (!previewFrame?.contentWindow) return;
		output = [];
		if (editorView) flashCode(editorView);


		const wrapped =
			evalPrefix +
			code +
			`\n      try { window.setup = setup } catch (e) { window.parent.postMessage({ type: "error", body: e.toString() }, '*'); };` +
			`\n      try { window.draw = draw } catch (e) { window.parent.postMessage({ type: "error", body: e.toString() }, '*'); };` +
			`\n      try { window.fabDraw = fabDraw } catch (e) { window.parent.postMessage({ type: "error", body: e.toString() }, '*'); };` +
			`\n      try { window.windowResized = windowResized } catch (e) { };` +
			`\n    }\n  })()()`;

		postToPreview(wrapped);

		if (!p5Initialized) {
			postToPreview(`try { remove() } catch (e) {}`);
			postToPreview(`new p5()`);
			p5Initialized = true;
		} else {
			postToPreview(`(() => {
				const _orig = p5.prototype.createCanvas;
				let _canvasResized = false;
				p5.prototype.createCanvas = function(w, h, renderer) {
					if (w === width && h === height) return this._renderer;
					_canvasResized = true;
					return _orig.call(this, w, h, renderer);
				};
				const savedPos = (typeof fab !== 'undefined' && fab) ? {x: fab.cameraPosition.x, y: fab.cameraPosition.y, z: fab.cameraPosition.z} : null;
				const savedOrientation = (typeof fab !== 'undefined' && fab) ? {x: fab.cameraOrientation.x, y: fab.cameraOrientation.y, z: fab.cameraOrientation.z} : null;
				try { setup(); } finally {
					p5.prototype.createCanvas = _orig;
					if (typeof fab !== 'undefined' && fab) {
						fab._needsCameraReInit = true;
						if (!_canvasResized && savedPos) {
							fab.cameraPosition.set(savedPos.x, savedPos.y, savedPos.z);
							fab.cameraOrientation.set(savedOrientation.x, savedOrientation.y, savedOrientation.z);
							fab.recoverCameraPosition = true;
						}
					}
				}
			})()`);
			postToPreview(`reloadSketch()`);
		}
	}

	const keybindings = Prec.highest(
		keymap.of([
			{
				key: 'Shift-Enter',
				preventDefault: true,
				run: () => {
					runCode();
					return true;
				}
			}
		])
	);

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		const urlCode = params.get('code');
		code = urlCode ? decodeURIComponent(urlCode) : templateSketch;
		originalCode = code;
		codeLoaded = true;
		initIframe = true;

		window.addEventListener('message', (e) => {
			if (e.origin !== window.location.origin && e.origin !== 'null') return;
			const msg = e.data;
			if (!msg) return;
			if (msg.type === 'error') {
				output = [{ type: 'error', body: msg.body }];
			} else if (msg.type === 'output') {
				const last = output.at(-1);
				if (last?.body === String(msg.body)) return;
				output = [...output, { type: 'log', body: String(msg.body) }];
			}
		});
	});

	async function copyCode() {
		await navigator.clipboard.writeText(code);
		copied = true;
		setTimeout(() => { copied = false; }, 1500);
	}

	function resetCode() {
		code = originalCode;
	}

	function handleIframeLoad() {
		previewFrame = /** @type {HTMLIFrameElement} */ (document.getElementById('embed-preview'));
		p5Initialized = false;

		postToPreview(`
			const s = document.createElement('style');
			s.textContent = '#nav-cube-wrap { display: none !important; }';
			document.head.appendChild(s);
		`);

		runCode();
	}
</script>

<div class="embed-wrap">
	<div class="pane editor-pane">
		<div class="toolbar">
			<button onclick={runCode}>Run</button>
			<span class="hint">Shift+Enter</span>
			<div class="toolbar-right">
				<button onclick={copyCode} class="icon-btn" title="Copy code">
					{#if copied}✓ Copied{:else}Copy{/if}
				</button>
				{#if code !== originalCode}
					<button onclick={resetCode} class="icon-btn" title="Reset to original">Reset</button>
				{/if}
			</div>
		</div>
		<div class="cm-wrap">
			{#if codeLoaded}
				<CodeMirror
					bind:value={code}
					on:ready={(e) => { editorView = e.detail; }}
					extensions={[keybindings]}
					lang={javascript()}
					styles={{
						'&': { width: '100%', height: '100%' }
					}}
				/>
			{/if}
		</div>
		{#if output.length > 0}
			<div class="output-pane">
				{#each output as line}
					<div class="output-line" class:error={line.type === 'error'}>{line.body}</div>
				{/each}
			</div>
		{/if}
	</div>

	<div class="pane preview-pane">
		{#if initIframe}
			<iframe
				title="p5.fab preview"
				id="embed-preview"
				onload={handleIframeLoad}
				src="/preview.html"
				sandbox="allow-scripts allow-downloads"
			></iframe>
		{/if}
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		overflow: hidden;
	}

	.embed-wrap {
		display: flex;
		width: 100vw;
		height: calc(100vh - 8px);
		overflow: visible;
		gap: 8px;
	}

	.pane {
		display: flex;
		flex-direction: column;
		min-width: 0;
		overflow: hidden;
	}

	.editor-pane {
		flex: 2;
		border: 1px solid black;
		box-shadow: 5px 5px var(--ma-orange, #ff6700);
	}

	.preview-pane {
		flex: 1;
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.6rem;
		border-bottom: 1px solid black;
		background: white;
		flex-shrink: 0;
	}

	.toolbar-right {
		margin-left: auto;
		display: flex;
		gap: 0.4rem;
	}

	.icon-btn {
		font-family: var(--font-mono, monospace);
		font-size: 0.75rem;
		padding: 0.2rem 0.5rem;
		border: 1px solid #ccc;
		background: white;
		cursor: pointer;
		color: #555;
	}

	.icon-btn:hover {
		border-color: black;
		color: black;
	}

	.toolbar button {
		font-family: var(--font-mono, monospace);
		font-size: 0.8rem;
		padding: 0.2rem 0.6rem;
		border: 1px solid black;
		background: white;
		cursor: pointer;
	}

	.toolbar button:hover {
		background: var(--ma-orange, #ff6700);
		color: white;
	}

	.hint {
		font-family: var(--font-mono, monospace);
		font-size: 0.7rem;
		color: #888;
	}

	.cm-wrap {
		flex: 1;
		overflow: hidden;
	}

	.output-pane {
		flex-shrink: 0;
		max-height: 6rem;
		overflow-y: auto;
		border-top: 1px solid black;
		padding: 0.4rem 0.6rem;
		font-family: var(--font-mono, monospace);
		font-size: 0.75rem;
		background: #fafafa;
	}

	.output-line {
		padding: 0.1rem 0;
	}

	.output-line.error {
		color: #c00;
	}

	.preview-pane iframe {
		width: 100%;
		height: 100%;
		border: 0;
		display: block;
	}
</style>
