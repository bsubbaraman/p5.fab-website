import { Parser } from "acorn";
import { sandboxOrigin } from "$lib/sandbox.js";
import { editorState, store } from "../store/state.svelte.js";
import { flashCode } from "$lib/flash.js";
import { highlightErrorLine, clearErrorHighlight } from "$lib/errorHighlight.js";
import { evalPrefix } from "$lib/evalPrefix.js";
import { wrapSketch, reloadWrapper } from "$lib/sketchWrap.js";


export function evalCode(code) {
  try {
    editorState.sketchWindow.contentWindow.postMessage({ type: 'eval', code }, sandboxOrigin());
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
    editorState.runId++;
    editorState.runHadSyntaxError = false;
    clearErrorHighlight(editorState.editorView);

    // evalPrefix is shared with embed/+page.svelte via $lib/evalPrefix.js
    const prefixLines = (evalPrefix.match(/\n/g) || []).length;

    const isFirstRun = !editorState.p5Initialized;
    const codeToEval = injectTryCatch(sketchCode, prefixLines, editorState.runId);

    // Flash and record BEFORE blocking work so the user sees feedback immediately
    flashCode(editorState.editorView);

    // A parse error means the new code can't run: injectTryCatch has already shown the
    // syntax error and set runHadSyntaxError. Leave the previously-running sketch as-is
    // (its async messages are now suppressed) rather than re-evaluating broken/empty code.
    if (editorState.runHadSyntaxError) return;

    editorState.lastRunCode = normalizeCode(sketchCode);

    // Yield to the browser so it can repaint the flash before the thread gets busy
    await new Promise(r => setTimeout(r, 0));

    editorState.sketchWindow.contentWindow.postMessage(
      { type: 'eval', code: wrapSketch(codeToEval, editorState.runId) },
      sandboxOrigin()
    );

    checkp5Init();

    if (!isFirstRun) {
      // Wrap setup() so createCanvas() is a no-op when dimensions haven't changed.
      // This prevents the canvas from going blank between runs, keeping the work
      // envelope visible. If dimensions change, the original createCanvas is allowed.
      editorState.sketchWindow.contentWindow.postMessage(
        { type: 'eval', code: reloadWrapper },
        sandboxOrigin()
      );
      editorState.sketchWindow.contentWindow.postMessage({ type: 'eval', code: `reloadSketch()` }, sandboxOrigin());
    }
  } catch (e) {
    setOutput(false, [{ type: "error", body: e.toString() }]);
  }
}

function injectTryCatch(sketchCode, prefixLines, runId) {
  try {
    var ast = Parser.parse(sketchCode, { ecmaVersion: 2020 });
  }
  catch (e) {
    const lineNum = e.loc?.line ?? null;
    editorState.runHadSyntaxError = true;
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
      // Wrap each top-level function body in try/catch so a runtime error reports the line
      // it happened on. The sketch runs via eval() in preview.html, so the raw line we
      // recover is relative to the eval'd string (line 1 = its first line); subtracting
      // lineOffset maps it back to the user's source line. Recovering that raw line is
      // browser-specific:
      //   - Chromium: stack frames read `... <anonymous>:LINE:COL`
      //   - Firefox:  stack frames read `... line N > eval:LINE:COL`  (the ` eval:` branch)
      //   - Safari/WebKit: no eval line in error.stack and no //# sourceURL support, but the
      //     Error object carries the throw location directly as e.line — used as the fallback.
      // Each error is stamped with runId so messageError can ignore reports from a superseded
      // run (a previous sketch still looping, or a stale frame just after a re-run).
      nodeBody =
        functionDeclaration +
        '\ntry {\n' + bodyContent +
        `\n}\ncatch (e){\n` +
        `const __m = e.stack && e.stack.match(/(?:<anonymous>| eval):(\\d+):\\d+/);\n` +
        `const __raw = __m ? parseInt(__m[1]) : (typeof e.line === 'number' ? e.line : null);\n` +
        `const __ln = __raw != null ? __raw - ${lineOffset} : null;\n` +
        `window.parent.postMessage({ type: "error", body: e.toString(), line: __ln, runId: ${runId} }, '*');\n` +
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
    editorState.sketchWindow.contentWindow.postMessage({ type: 'eval', code: `try { remove() } catch (e) { window.parent.postMessage({ type: "debug", body: "remove() failed"}, '*'); }` }, sandboxOrigin());
    editorState.sketchWindow.contentWindow.postMessage({ type: 'eval', code: `new p5()` }, sandboxOrigin());
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
