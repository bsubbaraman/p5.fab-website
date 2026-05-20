import { Parser } from "acorn";
import { editorState, store } from "../store/state.svelte.js";
import { flashCode } from "$lib/flash.js";
import { highlightErrorLine, clearErrorHighlight } from "$lib/errorHighlight.js";


export function evalCode(code) {
  try {
    editorState.sketchWindow.contentWindow.postMessage({ type: 'eval', code }, '*');
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

export async function evalSketch(sketchCode) {
  try {
    editorState.output = [];
    clearErrorHighlight(editorState.editorView);

    // Build prefix as an explicit string so prefixLines stays in sync with the wrapper
    const evalPrefix =
      `(() => {\n` +
      `    return () => {\n` +
      `      console.log = (function(){\n` +
      `        return function (txt) {\n` +
      `          window.parent.postMessage({ type: "output", body: txt});\n` +
      `        };\n` +
      `      })();\n` +
      `      `;
    const prefixLines = (evalPrefix.match(/\n/g) || []).length;

    const isFirstRun = !editorState.p5Initialized;
    const codeToEval = injectTryCatch(sketchCode, prefixLines);

    // Flash and record BEFORE blocking work so the user sees feedback immediately
    flashCode(editorState.editorView);
    editorState.lastRunCode = normalizeCode(sketchCode);

    // Yield to the browser so it can repaint the flash before the thread gets busy
    await new Promise(r => setTimeout(r, 0));

    editorState.sketchWindow.contentWindow.postMessage({ type: 'eval', code:
      evalPrefix +
      codeToEval +
      `\n      try { window.setup = setup } catch (e) { window.parent.postMessage({ type: "error", body: e.toString() }); };` +
      `\n      try { window.draw = draw } catch (e) { window.parent.postMessage({ type: "error", body: e.toString() }); };` +
      `\n      try { window.fabDraw = fabDraw } catch (e) { window.parent.postMessage({ type: "error", body: e.toString() }); };` +
      `\n      try { window.windowResized = windowResized } catch (e) { console.log("no resize") };` +
      `\n    }\n  })()()`
    }, '*');

    checkp5Init();

    if (!isFirstRun) {
      // Wrap setup() so createCanvas() is a no-op when dimensions haven't changed.
      // This prevents the canvas from going blank between runs, keeping the work
      // envelope visible. If dimensions change, the original createCanvas is allowed.
      editorState.sketchWindow.contentWindow.postMessage({ type: 'eval', code:
        `(() => {
            const _orig = p5.prototype.createCanvas;
            let _canvasResized = false;
            p5.prototype.createCanvas = function(w, h, renderer) {
                if (w === width && h === height) return this._renderer;
                _canvasResized = true;
                return _orig.call(this, w, h, renderer);
            };
            const savedPos = (typeof fab !== 'undefined' && fab) ? {x: fab.cameraPosition.x, y: fab.cameraPosition.y, z: fab.cameraPosition.z} : null;
            const savedOrientation = (typeof fab !== 'undefined' && fab) ? {x: fab.cameraOrientation.x, y: fab.cameraOrientation.y, z: fab.cameraOrientation.z} : null;
            try { setup(); } finally {
                p5.prototype.createCanvas = _orig;
                if (typeof fab !== 'undefined' && fab) {
                    fab._needsCameraReInit = true;
                    if (!_canvasResized && savedPos) {
                        fab.cameraPosition.set(savedPos.x, savedPos.y, savedPos.z);
                        fab.cameraOrientation.set(savedOrientation.x, savedOrientation.y, savedOrientation.z);
                        fab.recoverCameraPosition = true;
                    }
                }
            }
        })()`
      }, '*');
      editorState.sketchWindow.contentWindow.postMessage({ type: 'eval', code: `reloadSketch()` }, '*');
    }
  } catch (e) {
    setOutput(false, [{ type: "error", body: e.toString() }]);
  }
}

function injectTryCatch(sketchCode, prefixLines) {
  try {
    var ast = Parser.parse(sketchCode, { ecmaVersion: 2020 });
  }
  catch (e) {
    const lineNum = e.loc?.line ?? null;
    setOutput(false, [{ type: "error", body: e.message ?? e.toString() }]);
    if (lineNum && editorState.editorView) {
      highlightErrorLine(editorState.editorView, lineNum);
    }
    return '';
  }

  var codeToEval = '';
  for (const n in ast['body']) {
    var nodeBody = sketchCode.slice(ast['body'][n]['start'], ast['body'][n]['end']);
    if (ast['body'][n]['type'] == 'FunctionDeclaration') {
      let functionDeclaration = sketchCode.slice(ast['body'][n]['start'], ast['body'][n]['body']['start'] + 1);
      let functionBody = sketchCode.slice(ast['body'][n]['body']['start'] + 1, ast['body'][n]['end'] - 1);

      const prevNewlines = (codeToEval.match(/\n/g) || []).length;
      const funcDeclLines = functionDeclaration.split('\n').length;
      // eval line where the injected body starts:
      //   prefixLines newlines put us at line prefixLines+1,
      //   then prevNewlines from prior nodes,
      //   then funcDeclLines for the declaration itself,
      //   then +1 for the injected 'try {' line
      const evalBodyLine = prefixLines + 1 + prevNewlines + funcDeclLines + 1;
      const originalBodyLine = sketchCode.slice(0, ast['body'][n]['body']['start'] + 1).split('\n').length + 1;
      const lineOffset = evalBodyLine - originalBodyLine;

      const bodyContent = functionBody.startsWith('\n') ? functionBody.slice(1) : functionBody;
      nodeBody =
        functionDeclaration +
        '\ntry {\n' + bodyContent +
        `\n}\ncatch (e){\n` +
        `const __m = e.stack && e.stack.match(/<anonymous>:(\\d+):\\d+/);\n` +
        `const __ln = __m ? parseInt(__m[1]) - ${lineOffset} : null;\n` +
        `window.parent.postMessage({ type: "error", body: e.toString(), line: __ln });\n` +
        `}\n}\n`;
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
    editorState.sketchWindow.contentWindow.postMessage({ type: 'eval', code: `try { remove() } catch (e) { window.parent.postMessage({ type: "debug", body: "remove() failed"}); }` }, '*');
    editorState.sketchWindow.contentWindow.postMessage({ type: 'eval', code: `new p5()` }, '*');
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
