import { evalCode } from "$lib/repl";

// TODO: Camera
// import { recordCamera } from "./connectToCamera";

export function startPrint() {
    evalCode(`fab.print()`);
    // recordCamera();
}
