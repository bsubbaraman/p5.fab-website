import { evalCode } from "$lib/repl";

export function connectToMachine() {
    evalCode(`fab.serial.requestPort()`);
}
