import * as vscode from 'vscode';
import * as codemp from '../index'; // TODO why won't it work with a custom name???
import * as mapping from "./mapping";
import { LOGGER } from './extension';


let CACHE = new codemp.OpCache();
let MAPPINGS = new mapping.BufferMappingContainer();
let smallNumberDecorationType = vscode.window.createTextEditorDecorationType({});
let client : codemp.JsCodempClient | null = null;
let workspace : codemp.JsWorkspace | null = null;


export async function connect() {
	/*let host = await vscode.window.showInputBox({prompt: "server host (default to http://codemp.alemi.dev:50053)"});
	if(host===null) host="http://codemp.alemi.dev:50053";
	client = await codemp.connect(host);
	vscode.window.showInformationMessage(`Connected to codemp @[${host}]`);*/
	client = await codemp.connect();
	vscode.window.showInformationMessage('Connected to codemp with default host');
}

export async function login(){
	let username = await vscode.window.showInputBox({prompt: "enter username"});
	let workspace_name = await vscode.window.showInputBox({prompt: "enter workspace name"});
	if(client===null) throw "connect first";
	if(workspace_name===null) workspace_name="asd";
	await client.login(username!,"lmaodefaultpassword",workspace_name);
	vscode.window.showInformationMessage("Logged with username " + username + " into workspace " + workspace_name);
}


export async function join() {
	let workspace_id = await vscode.window.showInputBox({prompt: "workspace to attach (default to default)"});
	//let editor = vscode.window.activeTextEditor;
	if (workspace_id === undefined) return  // user cancelled with ESC
	if (workspace_id.length == 0) workspace_id = "asd"

	
	if(client===null) throw "connect first";
	workspace = await client.joinWorkspace(workspace_id)
	let controller = workspace.cursor();
	controller.callback((event: codemp.JsCursorEvent) => {
		let range_start : vscode.Position = new vscode.Position(event.start.row , event.start.col); // -1?
		let range_end : vscode.Position = new vscode.Position(event.end.row, event.end.col); // -1? idk if this works it's kinda funny, should test with someone with a working version of codemp
		const decorationRange = new vscode.Range(range_start, range_end);
		smallNumberDecorationType.dispose();
		smallNumberDecorationType = vscode.window.createTextEditorDecorationType({ 
			borderWidth: '5px',
			borderStyle: 'solid',
			overviewRulerColor: 'blue', 
			overviewRulerLane: vscode.OverviewRulerLane.Right,
			light: {
				// this color will be used in light color themes
				borderColor: 'darkblue' //should create this color based on event.user (uuid)
			},
			dark: {
				// this color will be used in dark color themes
				borderColor: 'lightblue' //should create this color based on event.user (uuid)
			}
		});

		let m = MAPPINGS.get_by_buffer(event.buffer);
		if (m===null) return;
		m.editor.setDecorations(smallNumberDecorationType, [decorationRange]);
	});


	vscode.window.onDidChangeTextEditorSelection((event: vscode.TextEditorSelectionChangeEvent) => {
		if (event.kind == vscode.TextEditorSelectionChangeKind.Command) return; // TODO commands might move cursor too
		let buf = event.textEditor.document.uri;
		let selection : vscode.Selection = event.selections[0] // TODO there may be more than one cursor!!
		let anchor : [number, number] = [selection.anchor.line, selection.anchor.character];
		let position : [number, number] = [selection.active.line, selection.active.character+1];
		let n = MAPPINGS.get_by_editor(buf)
		if (n===null) return;
		controller.send(n.buffer.getName(),anchor,position);
	});
	console.log("workspace id \n");
	console.log(workspace.id());
	vscode.window.showInformationMessage(`Connected to workspace @[${workspace}]`);
}


export async function createBuffer() {
	let bufferName : any = (await vscode.window.showInputBox({prompt: "path of the buffer to create"}))!;
	if(workspace===null) throw "join a workspace first"
	workspace.create(bufferName);
	console.log("new buffer created ", bufferName, "\n");
}





export async function attach() {
	let buffer_name : any = (await vscode.window.showInputBox({prompt: "buffer to attach to"}))!;
	if(workspace===null) throw "join a workspace first"
	let buffer : codemp.JsBufferController = await workspace.attach(buffer_name);
	console.log("attached to buffer", buffer_name);
	console.log("buffer", buffer);
	let editor = vscode.window.activeTextEditor;

	if (editor === undefined) {
		let fileUri = buffer_name;
		let random = (Math.random() + 1).toString(36).substring(2);
		const fileName = ''+ random ;
		//const newFileUri = vscode.Uri.file(fileName).with({ scheme: 'untitled', path: fileName });

		//Create a document not a file so it's temp and it doesn't get saved
		const newFileUri = vscode.Uri.file(fileName).with({ scheme: 'untitled', path: "" });
		//vscode.workspace.openTextDocument()
		await vscode.workspace.openTextDocument(newFileUri);
		vscode.commands.executeCommand('vscode.open', newFileUri); //It should already be opened with the api command above idk why i do this?
		//vscode.window.showInformationMessage(`Open a file first`);	
		//return;
	}
	editor = vscode.window.activeTextEditor!;
	//console.log("Buffer = ", buffer, "\n");
	vscode.window.showInformationMessage(`Connected to codemp workspace buffer  @[${buffer_name}]`);

	let file_uri : vscode.Uri = editor.document.uri;
	MAPPINGS.put(new mapping.BufferMapping(buffer, editor));

	vscode.workspace.onDidChangeTextDocument((event:vscode.TextDocumentChangeEvent) => {
		if (event.document.uri != file_uri) return; // ?
		for (let change of event.contentChanges) {
			if (CACHE.get(buffer_name, change.rangeOffset, change.text, change.rangeOffset + change.rangeLength)) continue;
			LOGGER.info(`onDidChangeTextDocument(event: [${change.rangeOffset}, ${change.text}, ${change.rangeOffset + change.rangeLength}])`);
			buffer.send({
				span: { 
					start: change.rangeOffset,
					end: change.rangeOffset+change.rangeLength
				},
				content: change.text
			});
		}
	});

	buffer.callback((event: codemp.JsTextChange) => {
		LOGGER.info(`buffer.callback(event: [${event.span.start}, ${event.content}, ${event.span.end}])`)
		CACHE.put(buffer_name, event.span.start, event.content, event.span.end);

		if (editor === undefined) { throw "Open an editor first" } 
		let range = new vscode.Range(
			editor.document.positionAt(event.span.start),
			editor.document.positionAt(event.span.end)
		)
		editor.edit(editBuilder => {
			editBuilder
				.replace(range, event.content)
		});
	});
}

/*export async function disconnectBuffer() { TODO i should just set buffer=null 
	let buffer : string = (await vscode.window.showInputBox({prompt: "buffer name for the file to disconnect from"}))!;
	codemp.disconnectBuffer(buffer);
	vscode.window.showInformationMessage(`Disconnected from codemp workspace buffer  @[${buffer}]`);
}*/

export async function sync() {
	if(workspace===null) throw "join a workspace first";
	let editor = vscode.window.activeTextEditor;
	if (editor === undefined) throw "no active editor to sync";
	let k = MAPPINGS.get_by_editor(editor.document.uri);
	if(k === null) throw "No such buffer managed by codemp"
	let buffer = workspace.bufferByName(k.buffer.getName());
	if (buffer==null) throw "This buffer does not exist anymore";

	let content = buffer.content();
	let doc_len = editor.document.getText().length;
	let range = new vscode.Range(
		editor.document.positionAt(0),
		editor.document.positionAt(doc_len)
	);
	
	CACHE.put(k.buffer.getName(), 0, content, doc_len);
	editor.edit(editBuilder => editBuilder.replace(range, content));
}

export async function listBuffers(){
	if(workspace===null) throw "join a workspace first"
	let buffers = workspace.filetree();
	console.log(buffers); // improve UX
}

// This method is called when your extension is deactivated
export function deactivate() {
//Maybe i should disconnect from every workspace and buffer ??? // TODO
}


export function printOpCache() {
	console.log("CACHE\n");
	console.log(CACHE.toString());
}
