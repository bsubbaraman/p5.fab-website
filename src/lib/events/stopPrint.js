import { evalCode } from "$lib/repl";

// TODO: Camera
// import { recordCamera } from "./connectToCamera";

export function stopPrint() {
    evalCode(`fab.stopPrint()`);
    // recordCamera();
}
