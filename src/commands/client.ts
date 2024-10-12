import * as vscode from 'vscode';
import * as codemp from 'codemp';
import * as mapping from "../mapping";
import { executeJump, workspaceState } from "./workspaces";
import { LOGGER, provider } from '../extension';


// TODO this "global state" should probably live elsewher but we need lo update it from these commands
export let client: codemp.Client | null = null;
export let workspace_list: string[] = [];
export let cursor_disposable: vscode.Disposable | null;

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
		workspace_id = await vscode.window.showQuickPick(workspace_list, { placeHolder: "workspace to join:" }, undefined);
	}
	if (!workspace_id) return;  // user cancelled with ESC
	if (vscode.workspace.workspaceFolders === undefined) {
		let ws = await vscode.window.showWorkspaceFolderPick({ placeHolder: "directory to open workspace into:" });
		if (ws === undefined) return vscode.window.showErrorMessage("Open a Workspace folder first");
	}
	workspaceState.workspace = await client.join_workspace(workspace_id);
	let controller = workspaceState.workspace.cursor();
	controller.callback(async function (controller: codemp.CursorController) {
		while (true) {
			let event = await controller.try_recv();
			if (workspaceState.workspace === null) {
				controller.clear_callback();
				LOGGER.info("left workspace, stopping cursor controller");
				return;
			}
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
			if (workspaceState.follow === event.user) executeJump(event.user);
			if (refresh) provider.refresh();
		}
	});

	let once = true;
	cursor_disposable = vscode.window.onDidChangeTextEditorSelection(async (event: vscode.TextEditorSelectionChangeEvent) => {
		if (event.kind == vscode.TextEditorSelectionChangeKind.Command) return; // TODO commands might move cursor too
		if (!workspaceState.justJumped) workspaceState.follow = null;
		workspaceState.justJumped = false;
		let buf = event.textEditor.document.uri;
		let selection: vscode.Selection = event.selections[0];
		let buffer = mapping.bufferMapper.by_editor(buf);
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
				if (workspaceState.workspace === null) break;
				let event = await workspaceState.workspace.event();
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

	for (let user of workspaceState.workspace.user_list()) {
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
	let workspace_id = await vscode.window.showQuickPick(workspace_list, { placeHolder: "workspace to invite to:" });
	if (workspace_id === undefined) return;
	let user_id = await vscode.window.showInputBox({ prompt: "Name of user to invite" });
	if (user_id === undefined) return;
	await client.invite_to_workspace(workspace_id, user_id);
	vscode.window.showInformationMessage("Invited " + user_id + " into workspace " + workspace_id);
}

export async function leave() {
	if (!client) throw "can't leave while disconnected";
	if (!workspaceState.workspace) throw "can't leave while not in a workspace";
	workspaceState.workspace.cursor().clear_callback()
	client.leave_workspace(workspaceState.workspace.id());
	if (cursor_disposable !== null) cursor_disposable.dispose();
	let workspace_id = workspaceState.workspace.id();
	workspaceState.workspace = null;
	provider.refresh();
	vscode.window.showInformationMessage("Left workspace " + workspace_id);
}


export async function refresh() {
	if (client === null) return vscode.window.showWarningMessage("Connect first");
	await client.refresh();
	vscode.window.showInformationMessage("Refreshed Session token");
}



