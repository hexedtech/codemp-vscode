import * as vscode from 'vscode';
import * as codemp from 'codemp';
import * as mapping from "../mapping";
import { workspace, setWorkspace } from "./workspaces";
import { LOGGER, provider } from '../extension';


// TODO this "global state" should probably live elsewher but we need lo update it from these commands
export let client: codemp.Client | null = null;
export let workspace_list: string[] = [];

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
	if (client === null) return vscode.window.showWarningMessage("Connect first");
	let workspace_id: string | undefined;
	if (selected !== undefined && selected.label !== undefined) {
		if (typeof (selected.label) === 'string') {
			workspace_id = selected.label;
		} else {
			workspace_id = selected.label.label; // TODO ughh what is this api?
		}
	} else {
		workspace_id = await vscode.window.showInputBox({ prompt: "name of workspace to attach to" });
	}
	if (!workspace_id) return;  // user cancelled with ESC
	if (vscode.workspace.workspaceFolders === undefined) {
		vscode.window.showErrorMessage("Open a Workspace folder first");
		return;
	}
	setWorkspace(await client.join_workspace(workspace_id));
	if (!workspace) return;
	let controller = workspace.cursor();
	controller.callback(async function(controller: codemp.CursorController) {
		while (true) {
			let event = await controller.try_recv();
			if (event === null) break;
			if (event.user === undefined) {
				LOGGER.warn(`Skipping cursor event without user: ${event}`)
				continue;
			}
			let mapp = mapping.colors_cache.get(event.user);
			if (mapp === undefined) { // first time we see this user
				mapp = new mapping.UserDecoration(event.user);
				mapping.colors_cache.set(event.user, mapp);
				provider.refresh();
			}
			let editor = mapping.bufferMapper.visible_by_buffer(event.buffer);
			let refresh = event.buffer != mapp.buffer;
			mapp.update(event, editor);
			if (refresh) provider.refresh();
		}
	});

	let once = true;
	vscode.window.onDidChangeTextEditorSelection(async (event: vscode.TextEditorSelectionChangeEvent) => {
		if (event.kind == vscode.TextEditorSelectionChangeKind.Command) return; // TODO commands might move cursor too
		let buf = event.textEditor.document.uri;
		let selection: vscode.Selection = event.selections[0]
		let buffer = mapping.bufferMapper.by_editor(buf)
		if (buffer === undefined) {
			if (once) {
				await controller.send({
					startRow: 0,
					startCol: 0,
					endRow: 0,
					endCol: 0,
					buffer: "",
				});
			}
			once = false;
		} else {
			await controller.send({
			startRow: selection.anchor.line,
			startCol: selection.anchor.character,
			endRow: selection.active.line,
				endCol: selection.active.character,
			buffer: buffer,
			user: undefined,
			});
			once = true;
		}
	});

	// TODO waiting for https://github.com/hexedtech/codemp/pull/19 to reach npm
	let event_handler = async () => {
		try {
			while (true) {
				if (workspace === null) break;
				let event = await workspace.event();
				if (event.type == "leave") {
					mapping.colors_cache.get(event.value)?.clear()
					mapping.colors_cache.delete(event.value);
				}
				if (event.type == "join") {
					mapping.colors_cache.set(event.value, new mapping.UserDecoration(event.value));
				}
				provider.refresh();
			}
		} catch (e) {
			console.log(`stopping event handler for workspace: ${e}`);
		}
	};
	event_handler();

	for (let user of workspace.user_list()) {
		mapping.colors_cache.set(user, new mapping.UserDecoration(user));
	}

	vscode.window.showInformationMessage("Connected to workspace");
	provider.refresh();
}






export async function listWorkspaces() {
	if (client === null) return vscode.window.showWarningMessage("Connect first");
	workspace_list = await client.list_workspaces(true, true);
	provider.refresh();
}



export async function createWorkspace() {
	if (client === null) return vscode.window.showWarningMessage("Connect first");
	let workspace_id = await vscode.window.showInputBox({ prompt: "Enter name for workspace" });
	if (workspace_id === undefined) return;
	await client.create_workspace(workspace_id);
	vscode.window.showInformationMessage("Created new workspace " + workspace_id);
	listWorkspaces();
}

export async function inviteToWorkspace() {
	if (client === null) return vscode.window.showWarningMessage("Connect first");
	let workspace_id = await vscode.window.showInputBox({ prompt: "Enter name of the workspace you want to invite the user into" });
	if (workspace_id === undefined) return;
	let user_id = await vscode.window.showInputBox({ prompt: "Enter name of the user you want to invite" });
	if (user_id === undefined) return;
	await client.invite_to_workspace(workspace_id, user_id);
	vscode.window.showInformationMessage("Invited " + user_id + " into workspace " + workspace_id);
}

export async function leaveWorkspace() {
	if (client === null) return vscode.window.showWarningMessage("Connect first");
	let workspace_id = await vscode.window.showInputBox({ prompt: "Enter name for workspace you want to leave" });
	if (workspace_id === undefined) return;
	await client.leave_workspace(workspace_id);
	vscode.window.showInformationMessage("Left workspace " + workspace_id);
	provider.refresh();
}

export async function refresh() {
	if (client === null) return vscode.window.showWarningMessage("Connect first");
	await client.refresh();
	vscode.window.showInformationMessage("Refreshed Session token");
}



