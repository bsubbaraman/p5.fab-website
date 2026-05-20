import { editorState } from '../store/state.svelte.js';
import { normalizeCode } from './repl.js';

function triggerDownload(content, filename, mimeType) {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

export function downloadSketch() {
	triggerDownload(editorState.globalSketch, editorState.projectTitle + '.js', 'text/javascript');
}

export async function doGcodeDownload() {
	const iframe = document.getElementById('preview');
	const commands = await new Promise((resolve) => {
		function handler(e) {
			if (e.source !== iframe.contentWindow) return;
			if (e.data?.type !== 'gcode_data') return;
			window.removeEventListener('message', handler);
			resolve(e.data.commands);
		}
		window.addEventListener('message', handler);
		iframe.contentWindow.postMessage({ type: 'get_gcode' }, '*');
	});
	triggerDownload((commands || []).join('\n'), editorState.projectTitle + '.gcode', 'text/plain');
}

export function downloadGcode() {
	if (
		editorState.lastRunCode !== null &&
		normalizeCode(editorState.globalSketch) !== editorState.lastRunCode
	) {
		editorState.staleGcodeDownloadModal = true;
		return;
	}
	doGcodeDownload();
}
