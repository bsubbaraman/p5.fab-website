import { editorState } from "../../store/state.svelte.js";
import { sandboxOrigin } from "$lib/sandbox.js";
import { isWebSerialSupported } from "$lib/webserial.js";

export function connectToMachine() {
    if (!isWebSerialSupported()) {
        editorState.printAlert =
            'Connecting to a printer needs the Web Serial API. Use Chrome or Edge, or Firefox with dom.serial.enabled turned on in about:config. You can still edit code and save g-code here.';
        return;
    }
    // Web Serial's requestPort() needs a user gesture in the sketch iframe's own frame — the
    // parent's click can't provide that across the sandbox origin. Ask the preview to surface a
    // connect button; the user's click there carries the gesture. (See armConnect in preview.html.)
    editorState.sketchWindow?.contentWindow?.postMessage({ type: 'arm_connect' }, sandboxOrigin());
}
