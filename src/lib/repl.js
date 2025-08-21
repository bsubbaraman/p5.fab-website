import { Parser } from "acorn";
import { editorState, store } from "../store/state.svelte.js";
import { flashCode } from "$lib/flash.js"

// export function evalSketchBlair(sketchCode) {
//   // Clear error output
//   editorState.output = [];
//   // TODO
//   // If you change values relatively fast in the editor (e.g. run fab.moveExtrude(100, 100, 0) then fab.moveExtrude(0, 100, 0)),
//   // I think the value of editorState.globalSketch hasn't updated yet and the old code is executed. Can see by the preview not changing.

//   // Inject try/catch loops here by iterating through the ast
//   try {
//     try {
//       var ast = Parser.parse(sketchCode, { ecmaVersion: 2020 });
//     }
//     catch (e) {
//       console.log("Catch 1");
//       window.parent.postMessage({ type: "error", body: e.toString() })
//       setOutput(false, [{ type: "error", body: e.toString() }]);
//     }

//     var codeToEval = '';
//     for (const n in ast['body']) {
//       var nodeBody = sketchCode.slice(ast['body'][n]['start'], ast['body'][n]['end']);
//       if (ast['body'][n]['type'] == 'FunctionDeclaration') {
//         let functionDeclaration = sketchCode.slice(ast['body'][n]['start'], ast['body'][n]['body']['start'] + 1);
//         let functionBody = sketchCode.slice(ast['body'][n]['body']['start'] + 1, ast['body'][n]['end'] - 1);

//         // post errors to be handled in setupMessages.js
//         nodeBody = functionDeclaration + '\ntry {\n' + functionBody + '\n}\ncatch (e){\nwindow.parent.postMessage({ type: "error", body: e.toString() });\n}\n}\n'
//       }
//       // else { // for code written outside of functions. check if needed
//       //   globalScope += nodeBody + '\n';
//       //   // nodeBody = '\ntry {\n' + nodeBody + '\n}\ncatch (e){\nwindow.parent.postMessage({ type: "error", body: e.toString() });\n}\n'
//       // }
//       codeToEval += nodeBody
//     }

//     editorState.sketchWindow.contentWindow.eval(codeToEval);
//     editorState.sketchWindow.contentWindow.eval("_once = false;"); // to run fabDraw again

//     // new p5 instance on startup
//     if (!editorState.p5Initialized) {
//       var newp5 = `new p5()`;
//       editorState.p5Initialized = true;

//       // post log values to display most recent gcode sent in web interface
//       var forwardLog = `const originalLog = console.log;
//                 console.log = (...args) => {
//                 parent.window.postMessage({ type: 'log', args: args }, '*')
//                 originalLog(...args)
//             };`
//       editorState.sketchWindow.contentWindow.eval(forwardLog);
//     }
//     else {
//       var newp5 = '';
//       // if (rerunSetup) { state.sketchWindow.eval(`setup()`) };
//     }
//     editorState.sketchWindow.contentWindow.eval(`${newp5}`);

//     // Can't post entire fab object
//     // Instead post the relevant info

//     // state.sketchWindow.eval(`window.parent.postMessage({ type: "log", body: fabOfInterest });`)

//     // flash code
//     flashCode(editorState.editorView);
//   }
//   catch (e) {
//     console.log("Catch 2");
//     console.log(e);
//     setOutput(false, [{ type: "error", body: e.toString() }]);
//   }
// }

export function evalCode(code) {
  try {
    editorState.sketchWindow.contentWindow.eval(code);
  }
  catch (error) {
    console.error(error);
  }
}

export function evalSketch(sketchCode) {
  try {
    // TODO: The bound value (editorState.globalSketch) has a slight delay
    // So now I instead access the editor state directly to get the code
    // BUT the first run when opening the sketch should used the loaded sketchCode
    // to not wait for the sketch to load into the editor
    // sketchCode = editorState.editorView.state.doc.toString();
    enableFabDraw();
    editorState.output = []; // clear output
    const codeToEval = injectTryCatch(sketchCode);
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
  } catch (e) {
    setOutput(false, [{ type: "error", body: e.toString() }]);
  }

  checkp5Init();
  flashCode(editorState.editorView);
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
  // Initialize new p5 on startup and when we need to re-run setup()
  if (!editorState.p5Initialized) {
    editorState.sketchWindow.contentWindow.eval(`try { remove() } catch (e) { window.parent.postMessage({ type: "debug", body: "remove() failed"}); }`)
    var newp5 = `new p5()`;
    editorState.p5Initialized = true;
  }
  else {
    var newp5 = '';
    // if (rerunSetup) { editorState.sketchWindow.contentWindow.eval(`setup()`) };
  }
  editorState.sketchWindow.contentWindow.eval(`${newp5}`);
}

function enableFabDraw() {
  // fabDraw is run once after setup
  // To re-run on code changes, set _once to false
  editorState.sketchWindow.contentWindow.eval(`_once = false`);

}

export function setOutput(append, line) {
  if (append) {
    editorState.output.push(line);
  } else {
    editorState.output = line;
  }
}
