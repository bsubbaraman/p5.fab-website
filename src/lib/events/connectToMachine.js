import { evalCode } from "$lib/repl";
import { editorState } from "../../store/state.svelte.js";

export function connectToMachine() {
    if (!('serial' in navigator)) {
        editorState.printAlert =
            'Connecting to a printer needs the Web Serial API, which works in Chrome, Edge, or another Chromium browser. You can still edit code and save g-code here.';
        return;
    }
    evalCode(`fab.serial.requestPort()`);
}
