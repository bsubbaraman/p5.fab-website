import { editorState } from '../store/state.svelte.js';
import { setOutput } from '$lib/repl.js';
import { highlightErrorLine } from '$lib/errorHighlight.js';

export function setupMessages() {
    // Setup messages with iframe
    window.addEventListener('message', function (e) {
        if (e.origin !== window.location.origin && e.origin !== 'null') return;
        const message = e.data;
        if (!message) return;

        const messageSwitch = {
            ready: messageReady,
            error: messageError,
            output: messageOutput,
            debug: messageDebug,
            fab_status: messageFabStatus,
            fab_config: messageFabConfig,
        };
        if (messageSwitch[message.type]) {
            messageSwitch[message.type](message.body, message.line);
        }
    });

    function messageReady(_) { }

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
            setOutput(false, [{ type: 'warn', body: messageBody }]);
            return;
        }

        if (messageBody.includes('p5.js says:')) {
            setOutput(false, [{ type: 'p5', body: messageBody }]);
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
