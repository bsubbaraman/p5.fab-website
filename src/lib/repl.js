import { Parser } from "acorn";
import { editorState, store } from "../store/state.svelte.js";
import { flashCode } from "$lib/flash.js"


export function evalCode(code) {
  try {
    editorState.sketchWindow.contentWindow.eval(code);
  }
  catch (error) {
    console.error(error);
  }
}

export function normalizeCode(code) {
  return code
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function evalSketch(sketchCode) {
  try {
    editorState.output = []; // clear output
    const codeToEval = injectTryCatch(sketchCode);
    const isFirstRun = !editorState.p5Initialized;

    editorState.sketchWindow.contentWindow.eval(
      `(() => {
        return () => {
          console.log = (function(){
            return function (txt) {
              window.parent.postMessage({ type: "output", body: txt});
            };
          })();
          ${codeToEval}
          try { window.setup = setup } catch (e) { window.parent.postMessage({ type: "error", body: e.toString() }); };
          try { window.draw = draw } catch (e) { window.parent.postMessage({ type: "error", body: e.toString() }); };
          try { window.fabDraw = fabDraw } catch (e) { window.parent.postMessage({ type: "error", body: e.toString() }); };
          try { window.windowResized = windowResized } catch (e) { console.log("no resize") };
        }
      })()()`
    )

    checkp5Init();

    if (!isFirstRun) {
      // Re-run setup so changes to setup() take effect immediately.
      // Note: p5.js DOM elements created in setup() (createButton, etc.) will
      // be duplicated on each run. Avoid creating DOM elements in setup().
      editorState.sketchWindow.contentWindow.eval(`setup()`);
      editorState.sketchWindow.contentWindow.eval(`reloadSketch()`);
    }
  } catch (e) {
    setOutput(false, [{ type: "error", body: e.toString() }]);
  }

  flashCode(editorState.editorView);
  editorState.lastRunCode = normalizeCode(sketchCode);
}

function injectTryCatch(sketchCode) {
  // Inject try/catches to preserve p5 context for streaming
  try {
    var ast = Parser.parse(sketchCode, { ecmaVersion: 2020 });
  }
  catch (e) {
    window.parent.postMessage({ type: "error", body: e.toString() })
    setOutput(false, [{ type: "error", body: e.toString() }]);
  }

  var codeToEval = '';
  for (const n in ast['body']) {
    var nodeBody = sketchCode.slice(ast['body'][n]['start'], ast['body'][n]['end']);
    if (ast['body'][n]['type'] == 'FunctionDeclaration') {
      let functionDeclaration = sketchCode.slice(ast['body'][n]['start'], ast['body'][n]['body']['start'] + 1);
      let functionBody = sketchCode.slice(ast['body'][n]['body']['start'] + 1, ast['body'][n]['end'] - 1);

      // Post errors to be handled in setupMessages.js
      nodeBody = functionDeclaration + '\ntry {\n' + functionBody + '\n}\ncatch (e){\nwindow.parent.postMessage({ type: "error", body: e.toString() });\n}\n}\n'
    }
    else {
      nodeBody = nodeBody + '\n';
    }
    codeToEval += nodeBody;
  }
  return codeToEval;
}

function checkp5Init() {
  if (!editorState.p5Initialized) {
    editorState.sketchWindow.contentWindow.eval(`try { remove() } catch (e) { window.parent.postMessage({ type: "debug", body: "remove() failed"}); }`)
    editorState.sketchWindow.contentWindow.eval(`new p5()`);
    editorState.p5Initialized = true;
  }
}

export function setOutput(append, line) {
  if (append) {
    editorState.output.push(line);
  } else {
    editorState.output = line;
  }
}
