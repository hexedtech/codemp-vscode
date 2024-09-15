import * as vscode from 'vscode';
import * as codemp from 'codemp';
import * as mapping from "./mapping";
import { LOGGER, provider } from './extension';


// TODO this "global state" should probably live elsewher but we need lo update it from these commands
export let client: codemp.Client | null = null;
export let workspace: codemp.Workspace | null = null;
export let workspace_list: string[] = [];
let locks : Map<string, boolean> = new Map();

export async function connect() {
	let config = vscode.workspace.getConfiguration('codemp');

	let username = config.get<string>("username");
	if (!username) {
		return vscode.window.showErrorMessage("missing username in settings: configure it first!");
	}

	let password = config.get<string>("password");
	if (!password) {
		return vscode.window.showErrorMessage("missing password in settings: configure it first!");
	}

	try {
		client = await codemp.connect({
			username: username,
			password: password,
			host: config.get<string>("server"),
			port: config.get<number>("port"),
			tls: config.get<boolean>("tls"),
		});
		vscode.window.showInformationMessage("Connected to codemp");
		provider.refresh();
		listWorkspaces(); // dont await, run in background
	} catch (e) {
		vscode.window.showErrorMessage("could not connect: " + e);
	}
}


export async function join(selected: vscode.TreeItem | undefined) {
	if (client === null) throw "connect first";
	let workspace_id: string | undefined;
	if (selected !== undefined && selected.label !== undefined) {
		if (typeof(selected.label) === 'string') {
			workspace_id = selected.label;
		} else {
			workspace_id = selected.label.label; // TODO ughh what is this api?
		}
	} else {
		workspace_id = await vscode.window.showInputBox({ prompt: "name of workspace to attach to" });
	}
	if (!workspace_id) return;  // user cancelled with ESC
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
	let bufferName: any = (await vscode.window.showInputBox({ prompt: "path of the buffer to create" }));
	if (workspace === null) throw "join a workspace first"
	workspace.create(bufferName);
	vscode.window.showInformationMessage(`new buffer created :${bufferName}`);
	provider.refresh();
}


export async function attach(selected: vscode.TreeItem | undefined) {
	if (workspace === null) throw "join a workspace first"
	let buffer_name: string | undefined;
	if (selected !== undefined && selected.label !== undefined) {
		if (typeof(selected.label) === 'string') {
			buffer_name = selected.label;
		} else {
			buffer_name = selected.label.label; // TODO ughh what is this api?
		}
	} else {
		buffer_name = await vscode.window.showInputBox({ prompt: "path of buffer to attach to" });
	}
	if (!buffer_name) return; // action cancelled by user
	let buffer: codemp.BufferController = await workspace.attach(buffer_name);
	await buffer.poll(); // wait for server changes
	LOGGER.info(`attached to buffer ${buffer_name}`);
	let editor = vscode.window.activeTextEditor;
	if (editor === undefined) {
		let random = (Math.random() + 1).toString(36).substring(2);
		const fileName = '' + random;
		const newFileUri = vscode.Uri.file(fileName).with({ scheme: 'untitled', path: "" });
		await vscode.workspace.openTextDocument(newFileUri);
		vscode.commands.executeCommand('vscode.open', newFileUri);
		editor = vscode.window.activeTextEditor!;
	}
	vscode.window.showInformationMessage(`Connected to codemp workspace buffer  @[${buffer_name}]`);

	let file_uri: vscode.Uri = editor.document.uri;
	mapping.bufferMapper.register(buffer.get_path(), file_uri);
	let bufferContent = await buffer.content();
	let doc_len = editor.document.getText().length;

	let range = new vscode.Range(
		editor.document.positionAt(0),
		editor.document.positionAt(doc_len)
	);
	await editor.edit(editBuilder => {
		editBuilder
			.replace(range, bufferContent)
	});
	vscode.workspace.onDidChangeTextDocument(async (event: vscode.TextDocumentChangeEvent) => {
		if (locks.get(buffer_name)) { return }
		if (event.document.uri !== file_uri) return; // ?
		for (let change of event.contentChanges) {
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
			let editor = mapping.bufferMapper.by_buffer(buffer_name);
			if (editor === undefined) { throw "Open an editor first" }
			let range = new vscode.Range(
				editor.document.positionAt(event.start),
				editor.document.positionAt(event.end)
			)
			locks.set(buffer_name, true);
			await editor.edit(editBuilder => {
				editBuilder
					.replace(range, event.content)
			});
			locks.set(buffer_name, false);

		}
	});
	provider.refresh();
}

export async function sync(selected: vscode.TreeItem | undefined) {
	if (workspace === null) throw "join a workspace first";
	let editor;
	let buffer_name;
	if (selected !== undefined && selected.label !== undefined) {
		if (typeof(selected.label) === 'string') {
			buffer_name = selected.label;
		} else {
			buffer_name = selected.label.label; // TODO ughh what is this api?
		}
		editor = mapping.bufferMapper.by_buffer(buffer_name);
		if (editor === undefined) throw "no active editor to sync";
	} else {
		editor = vscode.window.activeTextEditor;
		if (editor === undefined) throw "no active editor to sync";
		buffer_name = mapping.bufferMapper.by_editor(editor.document.uri);
		if (buffer_name === undefined) throw "No such buffer managed by codemp"
	}
	let controller = workspace.buffer_by_name(buffer_name);
	if (controller === null) throw "No such buffer controller"

	let content = await controller.content();
	let doc_len = editor.document.getText().length;
	let range = new vscode.Range(
		editor.document.positionAt(0),
		editor.document.positionAt(doc_len)
	);

	locks.set(buffer_name, true);
	await editor.edit(editBuilder => editBuilder.replace(range, content));
	locks.set(buffer_name, false);
}

export async function listBuffers() {
	if (workspace === null) throw "join a workspace first"
	let buffers = workspace.filetree(undefined, false);
	vscode.window.showInformationMessage(buffers.join("\n"));
	provider.refresh();
}


export async function createWorkspace() {
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
	vscode.window.showInformationMessage("Created new workspace " + workspace_id);
	provider.refresh();
}

export async function inviteToWorkspace() {
	if(client===null){
		vscode.window.showInformationMessage("Connect first");
		return;
	}
	let workspace_id = await vscode.window.showInputBox({ prompt: "Enter name of the workspace you want to invite the user into" });
	if(workspace_id===undefined){
		vscode.window.showInformationMessage("You didn't enter a name");
		return;
	}
	let user_id = await vscode.window.showInputBox({ prompt: "Enter name of the user you want to invite" });
	if(user_id===undefined){
		vscode.window.showInformationMessage("You didn't enter a name");
		return;
	}
	await client.invite_to_workspace(workspace_id,user_id);
	vscode.window.showInformationMessage("Invited " + user_id + "into workspace " + workspace_id);
	provider.refresh();
}

export async function listWorkspaces() {
	if(client===null){
		vscode.window.showInformationMessage("Connect first");
		return;
	}
	workspace_list = await client.list_workspaces(true, true);
	provider.refresh();
}

export async function leaveWorkspace() {
	if(client===null){
		vscode.window.showInformationMessage("Connect first");
		return;
	}
	let workspace_id = await vscode.window.showInputBox({ prompt: "Enter name for workspace you want to leave" });
	if(workspace_id===undefined){
		vscode.window.showInformationMessage("You didn't enter a name");
		return;
	}
	await client.leave_workspace(workspace_id);
	vscode.window.showInformationMessage("Left workspace " + workspace_id);
	provider.refresh();
}

export async function activeWorkspaces() {
	if(client===null){
		vscode.window.showInformationMessage("Connect first");
		return;
	}
	workspace_list = await client.active_workspaces();
	provider.refresh();
}

export async function refresh() {
	if(client===null){
		vscode.window.showInformationMessage("Connect first");
		return;
	}
	await client.refresh();
	vscode.window.showInformationMessage("Refreshed Session token");
	provider.refresh();
}


// This method is called when your extension is deactivated
export function deactivate() {
	//Maybe i should disconnect from every workspace and buffer ??? // TODO
}
