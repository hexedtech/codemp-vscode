/*


vscode
+ src
  + glue.rs
  + extension.ts
+ Cargo.toml
+ package.json


*/



// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
//import * as codempp from '/home/***REMOVED***/projects/codemp/mine/codempvscode/codemp.node';
const codemp = require("/home/***REMOVED***/projects/codemp/mine/vscode/target/debug/libcodemp_vscode.node");
// import * as codemp from "/home/***REMOVED***/projects/codemp/mine/vscode/target/debug/libcodemp_vscode.node";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "codempvscode" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('codempvscode.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage(process.cwd());
	});
	let connectCommand = vscode.commands.registerCommand('codempvscode.connect', connect);
	let joinCommand = vscode.commands.registerCommand('codempvscode.join', join);
	context.subscriptions.push(connectCommand);
	context.subscriptions.push(joinCommand);
	context.subscriptions.push(disposable);

}


async function connect() {
	let host = await vscode.window.showInputBox({prompt: "server host (default to http://alemi.dev:50051)"})
	if (host === undefined) return  // user cancelled with ESC
	if (host.length == 0) host = "http://alemi.dev:50051"
	await codemp.connect(host);
	vscode.window.showInformationMessage(`Connected to codemp ***REMOVED*** @[${host}]`);
}


async function join() {
	let workspace = await vscode.window.showInputBox({prompt: "workspace to attach (default to default)"})
	let buffer = await vscode.window.showInputBox({prompt: "buffer name for the file needed to update other clients cursors"})
	if (workspace === undefined) return  // user cancelled with ESC
	if (workspace.length == 0) workspace = "default"

	if (buffer === undefined) return  // user cancelled with ESC
	if (buffer.length == 0) workspace = "test"



	let controller = await codemp.join(workspace)
	controller.callback((event:any) => {
		console.log(event);
	});


	vscode.window.onDidChangeTextEditorSelection((event: vscode.TextEditorSelectionChangeEvent)=>{
		if(event.kind==1 || event.kind ==2){
		let buf = event.textEditor.document.uri.toString()
		let selection = event.selections[0] // TODO there may be more than one cursor!!
		//let anchor = [selection.anchor.line+1, selection.anchor.character]
		//let position = [selection.active.line+1, selection.active.character+1]
		let anchor = [selection.anchor.line, selection.anchor.character]
		let position = [selection.active.line, selection.active.character+1]
		console.log("Buffer from selection" + buffer+"\n");
		console.log("selection " + selection+"\n");
		console.log("Anchor selection" + anchor+"\n");
		console.log("position selection" + position+"\n");
		controller.send(buffer, anchor, position);
		}
	});
	vscode.window.showInformationMessage(`Connected to workspace @[${workspace}]`);
}



/*async function attach() {
	let workspace = await vscode.window.showInputBox({prompt: "workspace to attach (default to default)"})
	if (workspace === undefined) return  // user cancelled with ESC
	if (workspace.length == 0) workspace = "default"
	await codemp.attach(workspace);
	vscode.window.showInformationMessage(`Connected to codemp ***REMOVED*** @[${workspace}]`);
}*/


// This method is called when your extension is deactivated
export function deactivate() {}
