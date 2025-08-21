import { evalCode } from "$lib/repl";

// TODO: Camera
// import { recordCamera } from "./connectToCamera";

export function startPrint() {
    evalCode(`_fab.print()`);
    // recordCamera();
}
