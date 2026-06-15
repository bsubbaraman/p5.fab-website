import { evalCode } from '$lib/repl';

// Immediately halt the printer at the firmware level (M112). Unlike stopPrint(), this
// stops a print already in progress; the printer then needs a reset/reconnect.
export function emergencyStop() {
	evalCode(`fab.emergencyStop()`);
}
