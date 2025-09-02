import { evalCode } from "$lib/repl";

// TODO: Camera
// import { recordCamera } from "./connectToCamera";

export function stopPrint() {
    evalCode(`_fab.stopPrint()`);
    // recordCamera();
}
