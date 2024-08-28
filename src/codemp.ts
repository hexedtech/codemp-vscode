import * as vscode from 'vscode';
import * as codemp from '@codemp/codemp'; // TODO why won't it work with a custom name???
import * as mapping from "./mapping";
import { LOGGER } from './extension';


let CACHE = new codemp.OpCache();
let client: codemp.Client | null = null;
let workspace: codemp.Workspace | null = null;
let username: string = "";
let mine : boolean;

export async function connect() {
	let config = vscode.workspace.getConfiguration('codemp-vscode');
	let server : string = config.get("server", "http://codemp.dev:50053");
	let username : string = config.get("username")!;
	let password : string = config.get("password")!;
	console.log(server,username,password);
	client = await codemp.connect(server, username, password);
	console.log(client);
}


export async function join() {
	let workspace_id = await vscode.window.showInputBox({ prompt: "workspace to attach (default to default)" });
	if (workspace_id === undefined) return  // user cancelled with ESC
	if (workspace_id.length == 0) workspace_id = "diamond"
	if (client === null) throw "connect first";
	workspace = await client.join_workspace(workspace_id)
	let controller = workspace.cursor();
	controller.callback(async function (controller: codemp.CursorController) {
		while (true) {
			let event = await controller.try_recv();
			if (event === null) break;
			if (event.user === undefined) {
				console.log("Skipping cursor without user not found", event)
				continue;
			}
			let mapp = mapping.colors_cache.get(event.user)
			if (mapp === undefined) { // first time we see this user
				mapp = new mapping.UserDecoration(event);
				mapping.colors_cache.set(event.user, mapp);
			}
			let editor = mapping.bufferMapper.by_buffer(event.buffer);
			if (editor !== undefined) {
				mapp.apply(editor, event);
			}
		}
	});


	vscode.window.onDidChangeTextEditorSelection(async (event: vscode.TextEditorSelectionChangeEvent) => {
		if (event.kind == vscode.TextEditorSelectionChangeKind.Command) return; // TODO commands might move cursor too
		let buf = event.textEditor.document.uri;
		let selection: vscode.Selection = event.selections[0] // TODO there may be more than one cursor!!
		let anchor: [number, number] = [selection.anchor.line, selection.anchor.character];
		let position: [number, number] = [selection.active.line, selection.active.character + 1];
		let buffer = mapping.bufferMapper.by_editor(buf)
		if (buffer === undefined) return;
		let cursor: codemp.Cursor = {
			startRow: selection.anchor.line,
			startCol: selection.anchor.character,
			endRow: selection.active.line,
			endCol: selection.active.character + 1,
			buffer: buffer,
			user: undefined,
		}
		console.log("Sending Cursor");
		//await controller.send(cursor);
		console.log("Cursor sent");
	});
	vscode.window.showInformationMessage("Connected to workspace");
}


export async function createBuffer() {
	let bufferName: any = (await vscode.window.showInputBox({ prompt: "path of the buffer to create" }))!;
	if (workspace === null) throw "join a workspace first"
	workspace.create(bufferName);
	console.log("new buffer created ", bufferName, "\n");
}





export async function attach() {
	let buffer_name: any = (await vscode.window.showInputBox({ prompt: "buffer to attach to" }))!;
	if (workspace === null) throw "join a workspace first"
	let buffer: codemp.BufferController = await workspace.attach(buffer_name);
	console.log("attached to buffer", buffer_name);
	console.log("buffer", buffer);
	let editor = vscode.window.activeTextEditor;
	if (editor === undefined) {
		let fileUri = buffer_name;
		let random = (Math.random() + 1).toString(36).substring(2);
		const fileName = '' + random;
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

	let file_uri: vscode.Uri = editor.document.uri;
	mapping.bufferMapper.register(buffer.get_name(), editor);
	let bufferContent = await buffer.content(); //Temp fix for content not being applied when attached


	let range = new vscode.Range(
		editor.document.positionAt(0),
		editor.document.positionAt(0)
	);
	CACHE.put(buffer_name, 0, bufferContent, 0)
	editor.edit(editBuilder => {
		editBuilder
			.replace(range, bufferContent)
	});
	vscode.workspace.onDidChangeTextDocument(async (event: vscode.TextDocumentChangeEvent) => {
		if(mine) { return }
		if (event.document.uri !== file_uri) return; // ?
		for (let change of event.contentChanges) {
			let tmp = CACHE.get(buffer_name, change.rangeOffset, change.text, change.rangeOffset + change.rangeLength)
			console.log("CACHE DUMPP", tmp);
			if (tmp) continue; // Remove TMP is for debug
			LOGGER.info(`onDidChangeTextDocument(event: [${change.rangeOffset}, ${change.text}, ${change.rangeOffset + change.rangeLength}])`);
			console.log("Sending buffer event");
			await buffer.send({
				start: change.rangeOffset,
				end: change.rangeOffset + change.rangeLength,
				content: change.text
			});
			console.log("Buffer event sent");
		}
	});
	buffer.callback(async (controller: codemp.BufferController) => {
		while (true) {
			let event = await controller.try_recv();
			if (event === null) break;
			LOGGER.info(`buffer.callback(event: [${event.start}, ${event.content}, ${event.end}])`)
			console.log(`console log buffer.callback(event: [${event.start}, ${event.content}, ${event.end}])`)
			CACHE.put(buffer_name, event.start, event.content, event.end);
			if (editor === undefined) { throw "Open an editor first" }
			let range = new vscode.Range(
				editor.document.positionAt(event.start),
				editor.document.positionAt(event.end)
			)
			mine = true
			//Study more on this maybe it locks it
			await editor.edit(editBuilder => {
				editBuilder
					.replace(range, event.content)
			});
			mine = false;

		}
	});

}

export async function sync() {
	if (workspace === null) throw "join a workspace first";
	let editor = vscode.window.activeTextEditor;
	if (editor === undefined) throw "no active editor to sync";
	let buffer_name = mapping.bufferMapper.by_editor(editor.document.uri);
	if (buffer_name === undefined) throw "No such buffer managed by codemp"
	let controller = await workspace.buffer_by_name(buffer_name);
	if (controller === null) throw "No such buffer controller"

	let content = await controller.content();
	let doc_len = editor.document.getText().length;
	let range = new vscode.Range(
		editor.document.positionAt(0),
		editor.document.positionAt(doc_len)
	);

	CACHE.put(buffer_name, 0, content, doc_len);
	editor.edit(editBuilder => editBuilder.replace(range, content));
}

export async function listBuffers() {
	if (workspace === null) throw "join a workspace first"
	let buffers = workspace.filetree();
	console.log(buffers); // improve UX
}


export async function createWorkspace(){
	if(client===null){
		vscode.window.showInformationMessage("Connect first");
		return;
	}
	let workspace_id = await vscode.window.showInputBox({ prompt: "Enter name for workspace" });
	if(workspace_id===undefined){
		vscode.window.showInformationMessage("You didn't enter a name");
		return;
	}
	await client.create_workspace(workspace_id);
}

export async function listWorkspaces(){
	if(client===null){
		vscode.window.showInformationMessage("Connect first");
		return;
	}
	let result = await client.list_workspaces(true,true);
	console.log(result);
}




export async function helloWorld() {
	vscode.window.showInformationMessage("Hello World");
}


export function printOpCache() {
	console.log("CACHE\n");
	console.log(CACHE.toString());
}

// This method is called when your extension is deactivated
export function deactivate() {
	//Maybe i should disconnect from every workspace and buffer ??? // TODO
}