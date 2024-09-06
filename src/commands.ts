import * as vscode from 'vscode';
import * as codemp from 'codemp';
import * as mapping from "./mapping";
import { LOGGER, provider } from './extension';


// TODO this "global state" should probably live elsewher but we need lo update it from these commands
export let client: codemp.Client | null = null;
export let workspace: codemp.Workspace | null = null;
export let workspace_list: string[] = [];

let CACHE = new codemp.OpCache(); // TODO do we still need this after "mine" flag?


export async function connect() {
	let config = vscode.workspace.getConfiguration('codemp');
	let server = config.get<string>("server", "http://codemp.dev:50053");

	let username = config.get<string>("username");
	if (!username) {
		return vscode.window.showErrorMessage("missing username in settings: configure it first!");
	}

	let password = config.get<string>("password");
	if (!password) {
		return vscode.window.showErrorMessage("missing password in settings: configure it first!");
	}
	vscode.window.showInformationMessage("Connected to codemp");
	client = await codemp.connect(server, username, password);
	provider.refresh();
	listWorkspaces(); // dont await, run in background
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
				LOGGER.warn(`Skipping cursor event without user: ${event}`)
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
		let selection: vscode.Selection = event.selections[0]
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
		await controller.send(cursor);
	});
	vscode.window.showInformationMessage("Connected to workspace");
	provider.refresh();
}


export async function createBuffer() {
	let bufferName: any = (await vscode.window.showInputBox({ prompt: "path of the buffer to create" }))!;
	if (workspace === null) throw "join a workspace first"
	workspace.create(bufferName);
	vscode.window.showInformationMessage(`new buffer created :${bufferName}`);
	provider.refresh();
}


export async function attach() {
	let buffer_name: any = (await vscode.window.showInputBox({ prompt: "buffer to attach to" }))!;
	if (workspace === null) throw "join a workspace first"
	let buffer: codemp.BufferController = await workspace.attach(buffer_name);
	LOGGER.info(`attached to buffer ${buffer_name}`);
	let editor = vscode.window.activeTextEditor;
	if (editor === undefined) {
		let fileUri = buffer_name;
		let random = (Math.random() + 1).toString(36).substring(2);
		const fileName = '' + random;
		const newFileUri = vscode.Uri.file(fileName).with({ scheme: 'untitled', path: "" });
		await vscode.workspace.openTextDocument(newFileUri);
		vscode.commands.executeCommand('vscode.open', newFileUri);
	}
	editor = vscode.window.activeTextEditor!;
	vscode.window.showInformationMessage(`Connected to codemp workspace buffer  @[${buffer_name}]`);

	let file_uri: vscode.Uri = editor.document.uri;
	mapping.bufferMapper.register(buffer.get_path(), editor);
	let bufferContent = await buffer.content();


	let range = new vscode.Range(
		editor.document.positionAt(0),
		editor.document.positionAt(0)
	);
	CACHE.put(buffer_name, 0, bufferContent, 0)
	editor.edit(editBuilder => {
		editBuilder
			.replace(range, bufferContent)
	});
	let mine = false; // this toggles off send callback while we're updating the buffer TODO does it work? is it reliable?
	vscode.workspace.onDidChangeTextDocument(async (event: vscode.TextDocumentChangeEvent) => {
		if(mine) { return }
		if (event.document.uri !== file_uri) return; // ?
		for (let change of event.contentChanges) {
			if (CACHE.get(buffer_name, change.rangeOffset, change.text, change.rangeOffset + change.rangeLength)) continue;
			LOGGER.debug(`onDidChangeTextDocument(event: [${change.rangeOffset}, ${change.text}, ${change.rangeOffset + change.rangeLength}])`);
			await buffer.send({
				start: change.rangeOffset,
				end: change.rangeOffset + change.rangeLength,
				content: change.text
			});
		}
	});
	buffer.callback(async (controller: codemp.BufferController) => {
		while (true) {
			let event = await controller.try_recv();
			if (event === null) break;
			LOGGER.debug(`buffer.callback(event: [${event.start}, ${event.content}, ${event.end}])`)
			CACHE.put(buffer_name, event.start, event.content, event.end);
			if (editor === undefined) { throw "Open an editor first" }
			let range = new vscode.Range(
				editor.document.positionAt(event.start),
				editor.document.positionAt(event.end)
			)
			mine = true
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
	vscode.window.showInformationMessage(buffers.join("\n"));
	provider.refresh();
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
	provider.refresh();
}

export async function listWorkspaces(){
	if(client===null){
		vscode.window.showInformationMessage("Connect first");
		return;
	}
	workspace_list = await client.list_workspaces(true, true);
	provider.refresh();
}


// This method is called when your extension is deactivated
export function deactivate() {
	//Maybe i should disconnect from every workspace and buffer ??? // TODO
}
