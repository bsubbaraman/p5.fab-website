import { evalCode, normalizeCode } from "$lib/repl";
import { editorState } from "../../store/state.svelte.js";

export function startPrint() {
    if (!editorState.machineStatus.connected) {
        editorState.printAlert = 'No machine connection active. Connect to a printer first.';
        return;
    }
    if (
        !editorState.machineStatus.isPrinting &&
        editorState.lastRunCode !== null &&
        normalizeCode(editorState.globalSketch) !== editorState.lastRunCode
    ) {
        editorState.staleCodeModal = true;
        return;
    }
    evalCode(`fab.print()`);
}
