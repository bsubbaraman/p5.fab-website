import { EditorView, Decoration } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';

const addErrorLine = StateEffect.define();
const clearErrorLine = StateEffect.define();

const errorLineField = StateField.define({
    create() { return Decoration.none; },
    update(decorations, tr) {
        decorations = decorations.map(tr.changes);
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
