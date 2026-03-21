import * as vscode from 'vscode';
import * as codemp from 'codemp';
import * as mapping from "../mapping";
import * as utils from "../utils";
import { executeJump, workspaceState } from "./workspaces";
import { LOGGER, provider } from '../extension';


// TODO this "global state" should probably live elsewher but we need lo update it from these commands
export let client: codemp.Client | null = null;
export let workspace_list: codemp.WorkspaceIdentifier[] = [];
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
			host: config.get<string>("host"),
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
		let ws_list = []
		for (let ws of workspace_list) {
			ws_list.push(`${ws.user}/${ws.workspace}`)
		}
		workspace_id = await vscode.window.showQuickPick(ws_list, { placeHolder: "workspace to join:" }, undefined);
	}
	if (!workspace_id) return;  // user cancelled with ESC
	if (vscode.workspace.workspaceFolders === undefined) {
		let ws = await vscode.window.showWorkspaceFolderPick({ placeHolder: "directory to open workspace into:" });
		if (ws === undefined) return vscode.window.showErrorMessage("Open a Workspace folder first");
	}
	let split_wsid = workspace_id.split('/'); // TODO awful
	workspaceState.workspace = await client.attachWorkspace(split_wsid[0], split_wsid[1]);
	let controller = workspaceState.workspace.cursor();
	controller.callback(cursor_callback);

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
				controller.send({
					buffer: "",
					cursors: [
						{
							start: { row: 0, col: 0 },
							finish: { row: 0, col: 0 },
						}
					]
				});
			}
			once = false;
		} else {

			controller.send({
				buffer: buffer,
				cursors: [
					{
						start: { row: selection.anchor.line, col: selection.anchor.character },
						finish: { row: selection.active.line, col: selection.active.character },
					}
				],
			});
			once = true;
		}
	});

	workspaceState.workspace.callback(workspace_callback);

	for (let user of workspaceState.workspace.userList()) {
		mapping.colors_cache.set(user.name, new mapping.UserDecoration(user.name));
	}

	vscode.window.showInformationMessage("Connected to workspace");
	provider.refresh();
}

async function workspace_callback(error: Error|null, controller: codemp.Workspace) {
	if (error !== null) LOGGER.error(error);
	while (true) {
		if (workspaceState.workspace === null) {
			controller.clearCallback();
			LOGGER.info("left workspace, stopping receiving events");
			break;
		}
		let event = await workspaceState.workspace.tryRecv();
		if (event === null) break;
		switch (event.kind) {
			case codemp.WorkspaceEventKind.UserLeaveWorkspace:
				mapping.colors_cache.get(event.user ?? "")?.clear()
				mapping.colors_cache.delete(event.user ?? "");
				break;
			case codemp.WorkspaceEventKind.UserJoinWorkspace:
				mapping.colors_cache.set(event.user ?? "", new mapping.UserDecoration(event.user ?? ""));
				break;
			case codemp.WorkspaceEventKind.BufferCreate:
			case codemp.WorkspaceEventKind.BufferDelete:
			case codemp.WorkspaceEventKind.BufferRename:
			case codemp.WorkspaceEventKind.BufferAttrsUpdated:
				break;
			default:
				LOGGER.info(`incoming workspace event: ${JSON.stringify(event)}`);
		}
	}
	provider.refresh();
}

async function cursor_callback(error: Error|null, controller: codemp.CursorController) {
	if (error !== null) LOGGER.error(error);
	while (true) {
		if (workspaceState.workspace === null) {
			controller.clearCallback();
			LOGGER.info("left workspace, stopping cursor controller");
			return;
		}
		let event = await controller.tryRecv();
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

		let editor = mapping.bufferMapper.visible_by_buffer(event.position.buffer);
		let refresh = event.position.buffer != mapp.buffer;
		mapp.update(event.position, editor);
		if (workspaceState.follow === event.user) executeJump(event.user);
		if (refresh) provider.refresh();
	}
}


export async function listWorkspaces() {
	if (client === null) return vscode.window.showWarningMessage("Connect first");
	let workspace_joined = await client.fetchJoinedWorkspaces();
	let workspace_owned = await client.fetchOwnedWorkspaces();
	workspace_list = workspace_owned.concat(workspace_joined);
	provider.refresh();
}



export async function createWorkspace() {
	if (client === null) return vscode.window.showWarningMessage("Connect first");
	let workspace_id = await vscode.window.showInputBox({ prompt: "Enter name for workspace" });
	if (workspace_id === undefined) return;
	await client.createWorkspace(workspace_id);
	vscode.window.showInformationMessage("Created new workspace " + workspace_id);
	listWorkspaces();
}

export async function inviteToWorkspace() {
	if (client === null) return vscode.window.showWarningMessage("Connect first");
	let ws_list = workspace_list.filter((w) => w.user === client?.currentUser().name).map((w) => w.workspace);
	let workspace_id = await vscode.window.showQuickPick(ws_list, { placeHolder: "workspace to invite to:" });
	if (workspace_id === undefined) return;
	let user_id = await vscode.window.showInputBox({ prompt: "Name of user to invite" });
	if (user_id === undefined) return;
	await client.inviteToWorkspace(workspace_id, user_id);
	vscode.window.showInformationMessage("Invited " + user_id + " into workspace " + workspace_id);
}

export async function acceptInvite() {
	if (client === null) return vscode.window.showWarningMessage("Connect first");
	let user_id = await vscode.window.showInputBox({ prompt: "Workspace owner" });
	let ws_id = await vscode.window.showInputBox({ prompt: "Workspace name" });
	if (user_id !== undefined && ws_id !== undefined) {
		await client.acceptInvite(user_id, ws_id);
	}
}

export async function leave() {
	if (!client) throw "can't leave while disconnected";
	if (!workspaceState.workspace) throw "can't leave while not in a workspace";
	workspaceState.workspace.cursor().clearCallback();
	let wsid = workspaceState.workspace.id();
	client.leaveWorkspace(wsid.user, wsid.workspace);
	if (cursor_disposable !== null) cursor_disposable.dispose();
	let workspace_id = workspaceState.workspace.id();
	workspaceState.workspace = null;
	provider.refresh();
	vscode.window.showInformationMessage("Left workspace " + workspace_id);
}

export async function deleteWorkspace(selected: vscode.TreeItem | undefined) {
	if (client === null) return vscode.window.showWarningMessage("Connect first");
	let workspace = await utils.getOrPick(
		selected,
		workspace_list.filter((w) => w.user === client?.currentUser().name).map((w) => w.workspace),
		{ title: "codemp.deleteWorkspace", prompt: "workspace to delete" },
	);
	if (workspace === null) return;
	await client.deleteWorkspace(workspace);
	vscode.window.showInformationMessage("Deleted workspace " + workspace);
	listWorkspaces();
}


export async function refresh() {
	if (client === null) return vscode.window.showWarningMessage("Connect first");
	await client.refresh();
	vscode.window.showInformationMessage("Refreshed Session token");
}

export async function version(){
	vscode.window.showInformationMessage(`Version: ${codemp.version()}`);
}



