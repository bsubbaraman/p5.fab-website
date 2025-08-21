import { editorState } from '../store/state.svelte.js';
import { setOutput } from '$lib/repl.js';

export function setupMessages() {
    // Setup messages with iframe
    window.addEventListener('message', function (e) {
        const message = e.data;
        if (!message) return;

        const messageSwitch = {
            ready: messageReady,
            error: messageError,
            output: messageOutput,
            debug: messageDebug
        };
        messageSwitch[message.type](message.body);
    });

    function messageReady(_) { }

    function messageDebug(messageBody) {
        console.log(messageBody);
    }

    function messageError(messageBody) {
        console.debug('messageError:', messageBody);
        setOutput(false, [{ type: 'error', body: messageBody }]);
    }

    function messageOutput(messageBody) {
        // TODO: Should also be getting the line of the sketch that the log statement originated from
        // TODO: Better way of detecting P5 friendly errors
        console.debug(messageBody);
        messageBody = messageBody.toString();

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
