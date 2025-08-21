// Add Codemirror Decoration for flashing code on run
// Functionality inspired by hydra
// (https://github.com/hydra-synth/hydra/blob/aeea1cd794f9943356a5079b4911e9f8c3278bdc/frontend/web-editor/src/views/editor/editor.js#L122)
// Updated for Codemirror 6

import { EditorView, basicSetup } from 'codemirror';
import { keymap, Decoration } from '@codemirror/view';
import { EditorState, StateField, StateEffect } from '@codemirror/state';

const addHighlight = StateEffect.define({
    map: ({ from, to }, change) => ({
        from: change.mapPos(from),
        to: change.mapPos(to)
    })
});

const highlightField = StateField.define({
    create() {
        return Decoration.none;
    },
    update(highlights, tr) {
        highlights = highlights.map(tr.changes);
        for (let e of tr.effects) {
            if (e.is(addHighlight)) {
                highlights = highlights.update({
                    add: [highlightMark.range(e.value.from, e.value.to)]
                });
            } else if (e.is(removeHighlight)) {
                highlights = highlights.update({
                    filter: (f, t, value) => value.class == 'null'
                });
            }
        }
        return highlights;
    },
    provide: (f) => EditorView.decorations.from(f)
});

const highlightMark = Decoration.mark({ class: 'flash-code-on' });

export function flashCode(view) {
    let originalCursorPos = view.state.selection.main.head;

    // move cursor to the beginning of the document and highlight through to the end
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    let effects = view.state.selection.ranges
        .filter((r) => !r.empty)
        .map(({ from, to }) => addHighlight.of({ from, to }));

    if (!effects.length) return false;
    view.dispatch({ selection: { anchor: 0 } });
    if (!view.state.field(highlightField, false))
        effects.push(StateEffect.appendConfig.of([highlightField]));
    view.dispatch({ effects });

    // restore original cursor position and remove highlight
    view.dispatch({ selection: { anchor: originalCursorPos } });

    setTimeout(() => removeDecorationHighlight(view), 300);
    return true;
}

const removeHighlight = StateEffect.define();

export function removeDecorationHighlight(view) {
    view.dispatch({
        effects: removeHighlight.of({ from: 0, to: view.state.doc.length })
    });
}
