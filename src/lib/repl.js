import { Parser } from "acorn";
import { editorState, store } from "../store/state.svelte.js";
import { flashCode } from "$lib/flash.js";
import { highlightErrorLine, clearErrorHighlight } from "$lib/errorHighlight.js";


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

    editorState.sketchWindow.contentWindow.eval(
      evalPrefix +
      codeToEval +
      `\n      try { window.setup = setup } catch (e) { window.parent.postMessage({ type: "error", body: e.toString() }); };` +
      `\n      try { window.draw = draw } catch (e) { window.parent.postMessage({ type: "error", body: e.toString() }); };` +
      `\n      try { window.fabDraw = fabDraw } catch (e) { window.parent.postMessage({ type: "error", body: e.toString() }); };` +
      `\n      try { window.windowResized = windowResized } catch (e) { console.log("no resize") };` +
      `\n    }\n  })()()`
    );

    checkp5Init();

    if (!isFirstRun) {
      editorState.sketchWindow.contentWindow.eval(`setup()`);
      editorState.sketchWindow.contentWindow.eval(`reloadSketch()`);
    }
  } catch (e) {
    setOutput(false, [{ type: "error", body: e.toString() }]);
  }

  flashCode(editorState.editorView);
  editorState.lastRunCode = normalizeCode(sketchCode);
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
