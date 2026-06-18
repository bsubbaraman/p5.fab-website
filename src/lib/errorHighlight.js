import { EditorView, Decoration } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';

const addErrorLine = StateEffect.define();
const clearErrorLine = StateEffect.define();

const errorLineField = StateField.define({
    create() { return Decoration.none; },
    update(decorations, tr) {
        // Any edit makes the error's line stale, so drop the highlight immediately rather
        // than mapping it onto whatever line the edit shifts it to. (The editor's on:change
        // is debounced 300ms, so we can't rely on clearErrorHighlight() to do this in time.)
        decorations = tr.docChanged ? Decoration.none : decorations.map(tr.changes);
        for (const e of tr.effects) {
            if (e.is(addErrorLine)) {
                decorations = Decoration.none.update({
                    add: [errorLineMark.range(e.value.from)]
                });
            } else if (e.is(clearErrorLine)) {
                decorations = Decoration.none;
            }
        }
        return decorations;
    },
    provide: f => EditorView.decorations.from(f)
});

const errorLineMark = Decoration.line({ class: 'error-line-highlight' });

export function highlightErrorLine(view, lineNumber) {
    try {
        const line = view.state.doc.line(lineNumber);
        if (!view.state.field(errorLineField, false)) {
            view.dispatch({ effects: StateEffect.appendConfig.of([errorLineField]) });
        }
        view.dispatch({ effects: addErrorLine.of({ from: line.from }) });
    } catch (_) { /* invalid line number */ }
}

export function clearErrorHighlight(view) {
    if (view && view.state.field(errorLineField, false)) {
        view.dispatch({ effects: clearErrorLine.of(null) });
    }
}
