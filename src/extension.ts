// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
//import * as types from 'index';
//import * as codemp from '..';
//import * as codemp from '/home/***REMOVED***/projects/codemp/mine/codempvscode/codemp.node';
const codemp = require("/home/***REMOVED***/projects/codemp/mine/codempvscode/codemp.node");

var CACHE : string = "";
//import * as codemp from "/home/***REMOVED***/projects/codemp/mine/vscode/target/debug/libcodemp_vscode.node";

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
	let attachCommand = vscode.commands.registerCommand('codempvscode.attach', attach);
	let createBufferCommand = vscode.commands.registerCommand('codempvscode.createBuffer', createBuffer);
	context.subscriptions.push(connectCommand);
	context.subscriptions.push(joinCommand);
	context.subscriptions.push(attachCommand);
	context.subscriptions.push(createBufferCommand);
	context.subscriptions.push(disposable);

}


async function connect() {
	let host = await vscode.window.showInputBox({prompt: "server host (default to http://alemi.dev:50051)"})
	if (host === undefined) return  // user cancelled with ESC
	if (host.length == 0) host = "http://alemi.dev:50051"
	await codemp.connect(host);
	vscode.window.showInformationMessage(`Connected to codemp  @[${host}]`);
}


async function join() {
	let workspace = await vscode.window.showInputBox({prompt: "workspace to attach (default to default)"});
	let buffer : string = (await vscode.window.showInputBox({prompt: "buffer name for the file needed to update other clients cursors"}))!;
	let editor = vscode.window.activeTextEditor;
	//let editor = activeEditor.document.getText();
	//let doc = editor?.document;
	if (workspace === undefined) return  // user cancelled with ESC
	if (workspace.length == 0) workspace = "default"

	if (buffer === undefined) return  // user cancelled with ESC
	if (buffer.length == 0) {workspace = "test"; buffer="test"; }
	
	let controller = await codemp.join(workspace)
	try{
	controller.callback(( event:any) => {
		try{
		//console.log(event);
		let curPos  = vscode.window.activeTextEditor?.selection.active;
		let PosNumber = curPos?.line as number;
		let posizione = new vscode.Position(0, PosNumber);
		//console.log("posizione", posizione, "\n");
		let range_start = new vscode.Position(event.start.row , event.start.col); // -1?
		let range_end = new vscode.Position(event.end.row, event.end.col); // -1? idk if this works it's kinda funny, should test with someone with a working version of codemp
		/*console.log("range_start" ,range_start, "\n");
		console.log("range_end" ,range_end, "\n");*/
		const decorationRange = new vscode.Range(range_start, range_end);
		const smallNumberDecorationType = vscode.window.createTextEditorDecorationType({
			borderWidth: '5px',
			borderStyle: 'solid',
			overviewRulerColor: 'blue',
			overviewRulerLane: vscode.OverviewRulerLane.Right,
			light: {
				// this color will be used in light color themes
				borderColor: 'darkblue'
			},
			dark: {
				// this color will be used in dark color themes
				borderColor: 'lightblue'
			}
		});
		//let DECORATION = vscode.window.createTextEditorDecorationType({backgroundColor: 'red', color: 'white'});
		/*console.log("Editor" ,editor, "\n");
		console.log("Decoration range " , [decorationRange], "\n");*/
		editor?.setDecorations(smallNumberDecorationType, [decorationRange]);
	}catch(e){
		console.log("Error", e, "\n");
	}
	});
}catch(e){
	console.log("Error", e, "\n");
}


	vscode.window.onDidChangeTextEditorSelection((event: vscode.TextEditorSelectionChangeEvent)=>{
		if (event.kind == vscode.TextEditorSelectionChangeKind.Command) return; // TODO commands might move cursor too
		let buf = event.textEditor.document.uri.toString()
		let selection = event.selections[0] // TODO there may be more than one cursor!!
		//let anchor = [selection.anchor.line+1, selection.anchor.character]
		//let position = [selection.active.line+1, selection.active.character+1]
		let anchor : [number, number] = [selection.anchor.line, selection.anchor.character];
		let position : [number, number] = [selection.active.line, selection.active.character+1];
		/*console.log("Buffer from selection" + buffer+"\n");
		console.log("selection " + selection+"\n");
		console.log("Anchor selection" + anchor+"\n");
		console.log("position selection" + position+"\n");*/
		controller.send(buffer, anchor, position);
	});
	vscode.window.showInformationMessage(`Connected to workspace @[${workspace}]`);
}


async function createBuffer(){
	let buffer : string = (await vscode.window.showInputBox({prompt: "path of the buffer to create"}))!;
	console.log("new buffer created ", buffer, "\n");
	codemp.create(buffer);
	console.log("new createdBuffer ", createBuffer, "\n");
	//TODO push all the current opened file onto the buffer
}





async function attach() {
	let workspace="test";
	let buffer = await codemp.attach(workspace);

	let editor = vscode.window.activeTextEditor;

	if (editor === undefined) { return } // TODO say something!!!!!!

	let range = new vscode.Range(
		editor.document.positionAt(0),
		editor.document.positionAt(editor.document.getText().length)
	)
	await editor.edit(editBuilder => editBuilder.replace(range, buffer.content()))

	console.log("Buffer = ", buffer, "\n");
	vscode.window.showInformationMessage(`Connected to codemp workspace buffer  @[${workspace}]`);

	console.log("kiao");

	vscode.workspace.onDidChangeTextDocument((event:vscode.TextDocumentChangeEvent) =>{
		console.log(event.reason);
		for (let change of event.contentChanges) {
			if (`${change.rangeOffset}${change.text}${change.rangeOffset+change.rangeLength}` === CACHE) continue; 
			let op = buffer.delta(change.rangeOffset,change.text,change.rangeOffset+change.rangeLength)
			if (op != null) { buffer.send(op) }
			else { console.log("change is empty") }
		}
	});

	buffer.callback((event:any) =>{
		CACHE = `${event.span.start}${event.content}${event.span.end}`; //what's the difference between e.text and e.content like it's on lib.rs?

		if (editor === undefined) { return } // TODO say something!!!!!!
		let range = new vscode.Range(
			editor.document.positionAt(event.span.start),
			editor.document.positionAt(event.span.end)
		)
		editor.edit(editBuilder => editBuilder.replace(range, event.content))
	});
}






// This method is called when your extension is deactivated
export function deactivate() {}
