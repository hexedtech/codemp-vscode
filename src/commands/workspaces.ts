import * as vscode from 'vscode';
import * as codemp from 'codemp';
import * as mapping from "../mapping";
import * as utils from "../utils";
import { provider } from '../extension';


export let workspaceState: {
	workspace: codemp.Workspace | null,
	follow: string | null,
	justJumped: boolean,
} = {
	workspace: null,
	follow: null,
	justJumped: false,
};


export async function jump(selected: vscode.TreeItem | undefined) {
	if (workspaceState.workspace === null) return vscode.window.showWarningMessage("Join a workspace first");
	let user = await utils.getOrPick(
		selected,
		workspaceState.workspace.userList().map((u) => u.name),
		{ title: "codemp.jump", prompt: "user to jump to" },
	);
	if (user === null) return; // user exited picker
	workspaceState.follow = user;
	executeJump(user);
}

export async function executeJump(user: string) {
	let user_hl = mapping.colors_cache.get(user);
	if (user_hl === undefined) return vscode.window.showWarningMessage("unknown position of such user");
	let uri = mapping.bufferMapper.uri_by_buffer(user_hl.buffer);
	if (uri === undefined) {
		return vscode.window.showWarningMessage("user is on an untracked buffer: " + user_hl.buffer);
	}
	let editor = vscode.window.activeTextEditor;
	if (editor === undefined || editor.document.uri != uri) {
		workspaceState.justJumped = true;
		editor = await vscode.window.showTextDocument(uri, { preserveFocus: false });
	}
	let range_start: vscode.Position = new vscode.Position(user_hl.startRow, user_hl.startCol);
	let range_end: vscode.Position = new vscode.Position(user_hl.endRow, user_hl.endCol);
	let cursor_range = new vscode.Range(range_start, range_end);
	editor.revealRange(cursor_range, vscode.TextEditorRevealType.InCenter);
}

export async function createBuffer() {
	let bufferName: any = (await vscode.window.showInputBox({ prompt: "path of the buffer to create" }));
	if (workspaceState.workspace === null) return vscode.window.showWarningMessage("Join a workspace first");
	await workspaceState.workspace.createBuffer(bufferName, { ephemeral: false });
	vscode.window.showInformationMessage(`new buffer created :${bufferName}`);
	provider.refresh();
}

export async function listBuffers() {
	if (workspaceState.workspace === null) return vscode.window.showWarningMessage("Join a workspace first");
	let buffers = workspaceState.workspace.searchBuffers();
	vscode.window.showInformationMessage(buffers.join("\n"));
	provider.refresh();
}

export async function deleteBuffer(selected: vscode.TreeItem | undefined) {
	if (workspaceState.workspace === null) return vscode.window.showWarningMessage("Join a workspace first");
	let bufferName = await utils.getOrPick(
		selected,
		workspaceState.workspace.searchBuffers().map((b) => b.path.path),
		{ prompt: "buffer to delete:", title: "codemp.deleteBuffer" },
	);
	if (bufferName === null) return; // user exited picker
	await workspaceState.workspace.deleteBuffer(bufferName);
	vscode.window.showInformationMessage(`Deleted buffer :${bufferName}`);
	provider.refresh();
}

export async function pinUnpinBuffer(selected: vscode.TreeItem | undefined) {
	if (workspaceState.workspace === null) return vscode.window.showWarningMessage("Join a workspace first");
	let bufferName = await utils.getOrPick(
		selected,
		workspaceState.workspace.searchBuffers().map((b) => b.path.path),
		{ prompt: "buffer to delete:", title: "codemp.deleteBuffer" },
	);
	if (bufferName === null) return; // user exited picker

	let node = workspaceState.workspace.searchBuffers(bufferName)[0];
	if (node.attributes.ephemeral) {
		await workspaceState.workspace.pinBuffer(bufferName);
		vscode.window.showInformationMessage(`Pinned buffer: ${bufferName}`);
	} else {
		await workspaceState.workspace.unpinBuffer(bufferName);
		vscode.window.showInformationMessage(`Un-Pinned buffer: ${bufferName}`);
	}

	provider.refresh();
}
