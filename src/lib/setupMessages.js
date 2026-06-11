import { editorState } from '../store/state.svelte.js';
import { setOutput } from '$lib/repl.js';
import { highlightErrorLine } from '$lib/errorHighlight.js';

/**
 * Messages received from the sketch iframe (p5.fab.js → parent editor):
 *
 * ready            — iframe has loaded; no body
 * parsing_start    — G-code parsing begun; no body
 * parsing_complete — G-code parsing done; no body
 * error            — { body: string, line?: number }
 * output           — { body: string }
 * debug            — { body: any }
 * fab_config       — full batch on setPrinter: { nozzleDiameter, filamentDiameter, maxX, maxY, maxZ }
 *                    single-property change:   { property: string, value: any }
 * fab_status       — { event: 'connection',     connected: boolean }
 *                    { event: 'print_start' }
 *                    { event: 'print_complete' }
 *                    { event: 'print_error',    reason: 'already_printing'|'no_commands' }
 *                    { event: 'temp',           nozzle?: number, bed?: number }
 *                    { event: 'position',       x?: number, y?: number, z?: number }
 */
export function setupMessages() {
    // Setup messages with iframe
    window.addEventListener('message', function (e) {
        // Only accept messages from our sketch iframe's own window. This is
        // origin-independent, so it holds when the sketch runs on the separate
        // sandbox origin in production.
        const sketchWin = editorState.sketchWindow?.contentWindow;
        if (!sketchWin || e.source !== sketchWin) return;
        const message = e.data;
        if (!message) return;

        const messageSwitch = {
            ready: messageReady,
            error: messageError,
            output: messageOutput,
            debug: messageDebug,
            fab_status: messageFabStatus,
            fab_config: messageFabConfig,
            parsing_start: messageParsingStart,
            parsing_complete: messageParsingComplete,
        };
        if (messageSwitch[message.type]) {
            messageSwitch[message.type](message.body, message.line);
        }
    });

    function messageReady(_) { }

    function messageParsingStart() {
        editorState.isParsing = true;
    }

    function messageParsingComplete() {
        editorState.isParsing = false;
    }

    function messageFabConfig(body) {
        if (body.property) {
            editorState.machineStatus[body.property] = body.value;
        } else {
            editorState.machineStatus.nozzleDiameter = body.nozzleDiameter;
            editorState.machineStatus.filamentDiameter = body.filamentDiameter;
            editorState.machineStatus.maxX = body.maxX;
            editorState.machineStatus.maxY = body.maxY;
            editorState.machineStatus.maxZ = body.maxZ;
        }
    }

    function messageFabStatus(body) {
        if (body.event === 'connection') {
            editorState.machineStatus.connected = body.connected;
            if (!body.connected) {
                editorState.machineStatus.nozzleTemp = null;
                editorState.machineStatus.bedTemp = null;
                editorState.machineStatus.x = null;
                editorState.machineStatus.y = null;
                editorState.machineStatus.z = null;
                editorState.machineStatus.isPrinting = false;
            }
        } else if (body.event === 'print_start') {
            editorState.machineStatus.isPrinting = true;
        } else if (body.event === 'print_complete') {
            editorState.machineStatus.isPrinting = false;
        } else if (body.event === 'print_error') {
            if (body.reason === 'already_printing') {
                editorState.printAlert = 'A print is already running.';
            } else if (body.reason === 'no_commands') {
                editorState.printAlert = 'Nothing to print. Run your sketch first to generate commands.';
            }
        } else if (body.event === 'temp') {
            if (body.nozzle !== undefined) editorState.machineStatus.nozzleTemp = body.nozzle;
            if (body.bed !== undefined) editorState.machineStatus.bedTemp = body.bed;
        } else if (body.event === 'position') {
            if (body.x !== undefined) editorState.machineStatus.x = body.x;
            if (body.y !== undefined) editorState.machineStatus.y = body.y;
            if (body.z !== undefined) editorState.machineStatus.z = body.z;
        }
    }

    function messageDebug(messageBody) {
        console.log(messageBody);
    }

    function messageError(messageBody, line) {
        console.debug('messageError:', messageBody);
        setOutput(false, [{ type: 'error', body: messageBody }]);
        if (line && editorState.editorView) {
            highlightErrorLine(editorState.editorView, line);
        }
    }

    function messageOutput(messageBody) {
        // TODO: Should also be getting the line of the sketch that the log statement originated from
        // TODO: Better way of detecting P5 friendly errors
        console.debug(messageBody);
        messageBody = messageBody.toString();

        if (messageBody.includes('p5.fab says:')) {
            setOutput(true, { type: 'warn', body: messageBody });
            return;
        }

        if (messageBody.includes('p5.js says:')) {
            setOutput(true, { type: 'p5', body: messageBody });
            return;
        }

        if (!editorState.output.length) {
            setOutput(false, [{ type: 'log', body: messageBody, count: 1 }]);
            return;
        }

        if (messageBody === editorState.output.at(-1).body) {
            editorState.output.at(-1).count += 1;
        } else {
            setOutput(true, { type: 'log', body: messageBody, count: 1 });
        }
    }
}
