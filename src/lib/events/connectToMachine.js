import { evalCode } from "$lib/repl";

export function connectToMachine() {
    evalCode(`_fab.serial.requestPort()`);
}
