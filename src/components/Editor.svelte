<script>
	import { onMount } from 'svelte';
	import { editorState } from '../store/state.svelte.js';
	import { templateSketch } from '$lib/examples/examples';
	import { evalSketch } from '$lib/repl.js';
	import { setupMessages } from '$lib/setupMessages.js';
	import { keymap } from '@codemirror/view';
	import { javascript } from '@codemirror/lang-javascript';
	import { acceptCompletion, completionStatus } from '@codemirror/autocomplete';
	import { indentWithTab, indentMore, indentLess } from '@codemirror/commands';
	import { Prec } from '@codemirror/state';
	import CodeMirror from 'svelte-codemirror-editor';

	// testing dynamic linter
	import { linter } from '@codemirror/lint';
	import * as acorn from 'acorn';

	editorState.globalSketch = templateSketch;

	// Setup keybindings
	// Use Prec.highest to override default keybindings
	// https://discuss.codemirror.net/t/overriding-certain-default-keymaps/6181
	const keybindings = Prec.highest(
		keymap.of([
			{
				key: 'Shift-Enter',
				preventDefault: true,
				run: () => {
					evalSketch(editorState.globalSketch);
					return true;
				}
			},
			{
				key: 'Tab',
				preventDefault: true,
				shift: indentLess,
				run: (e) => {
					if (!completionStatus(e.state)) return indentMore(e);
					return acceptCompletion(e);
				}
			}
		])
	);

	// trying linter
	// // This linter will always look for a `customLinter` function in the doc
	// function interpret(code) {
	// 	const ast = acorn.parse(code, { ecmaVersion: 2020 });
	// 	const env = {};

	// 	function evalExpression(node) {
	// 		switch (node.type) {
	// 			case 'Literal':
	// 				return node.value;
	// 			case 'Identifier':
	// 				return env[node.name];
	// 			case 'BinaryExpression': {
	// 				const left = evalExpression(node.left);
	// 				const right = evalExpression(node.right);
	// 				switch (node.operator) {
	// 					case '+':
	// 						return left + right;
	// 					case '-':
	// 						return left - right;
	// 					case '*':
	// 						return left * right;
	// 					case '/':
	// 						return left / right;
	// 					case '>':
	// 						return left > right;
	// 					case '<':
	// 						return left < right;
	// 					case '==':
	// 						return left == right;
	// 					case '===':
	// 						return left === right;
	// 				}
	// 			}
	// 			case 'AssignmentExpression': {
	// 				const val = evalExpression(node.right);
	// 				if (node.left.type === 'Identifier') env[node.left.name] = val;
	// 				return val;
	// 			}
	// 		}
	// 	}

	// 	function evalStatement(node) {
	// 		switch (node.type) {
	// 			case 'VariableDeclaration':
	// 				for (const decl of node.declarations) {
	// 					env[decl.id.name] = decl.init ? evalExpression(decl.init) : undefined;
	// 				}
	// 				break;
	// 			case 'ExpressionStatement':
	// 				evalExpression(node.expression);
	// 				break;
	// 			case 'ForStatement': {
	// 				if (node.init) evalStatement(node.init);
	// 				while (node.test ? evalExpression(node.test) : true) {
	// 					if (node.body.type === 'BlockStatement') {
	// 						for (const stmt of node.body.body) evalStatement(stmt);
	// 					} else {
	// 						evalStatement(node.body);
	// 					}
	// 					if (node.update) evalExpression(node.update);
	// 				}
	// 				break;
	// 			}
	// 		}
	// 	}

	// 	for (const stmt of ast.body) {
	// 		evalStatement(stmt);
	// 	}
	// 	return env;
	// }

	// // --- CodeMirror linter ---
	// const myLinter = linter((view) => {
	// 	const code = view.state.doc.toString();
	// 	let diagnostics = [];

	// 	try {
	// 		// Run program and collect variables
	// 		const vars = interpret(code);
	// 		console.log(vars);

	// 		// Extract customLinter function
	// 		const fnMatch = code.match(/function\s+customLinter\s*\([^)]*\)\s*\{[\s\S]*?\}/);
	// 		if (fnMatch) {
	// 			// Wrap in new Function to safely return it
	// 			const linterFn = new Function(`
	//       ${fnMatch[0]};
	//       return customLinter;
	//     `)();

	// 			if (typeof linterFn === 'function') {
	// 				const message = linterFn(vars);
	// 				if (message) {
	// 					diagnostics.push({
	// 						from: 0,
	// 						to: code.length,
	// 						message,
	// 						severity: 'warning'
	// 					});
	// 				}
	// 			}
	// 		}
	// 	} catch (e) {
	// 		diagnostics.push({
	// 			from: 0,
	// 			to: code.length,
	// 			message: 'Error: ' + e.message,
	// 			severity: 'error'
	// 		});
	// 	}

	// 	return diagnostics;
	// });

	const customExtensions = [keybindings]; //, myLinter

	function onEditorChange() {
		if (editorState.saved) {
			editorState.saved = false;
			const saveButton = document.getElementById('sketchSaveBtn');
			saveButton.disabled = false;
		}
	}

	onMount(() => {
		// setupMessages();
	});
</script>

<CodeMirror
	on:ready={(e) => (editorState.editorView = e.detail)}
	on:change={onEditorChange}
	bind:value={editorState.globalSketch}
	extensions={customExtensions}
	lang={javascript()}
	styles={{
		'&': {
			width: '100%',
			maxWidth: '100%',
			height: '100%',
			maxHeight: '100%'
		}
	}}
/>

<style>
	/* CodeMirror styles have to be in app.css to take effect */
</style>
