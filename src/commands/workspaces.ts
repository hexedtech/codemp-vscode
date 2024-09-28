import * as vscode from 'vscode';
import * as codemp from 'codemp';
import * as mapping from "../mapping";
import {client} from "./client"
import { LOGGER, provider } from '../extension';


export let workspace: codemp.Workspace | null = null;


export function setWorkspace(ws : codemp.Workspace){
	workspace = ws;
}


export async function jump(selected: vscode.TreeItem | undefined){
	if (client === null) return vscode.window.showWarningMessage("Connect first");
	let user;
	if (selected !== undefined && selected.label !== undefined) {
		if (typeof(selected.label) === 'string') {
			user = selected.label;
		} else {
			user = selected.label.label; 
		}
	}
	if (!user) user = await vscode.window.showInputBox({ prompt: "username"});
	if (!user) return;  // user cancelled with ESC
	
	let user_hl = mapping.colors_cache.get(user);
	if (user_hl === undefined) return vscode.window.showWarningMessage("unknown position of such user");
	let uri = mapping.bufferMapper.uri_by_buffer(user_hl.buffer);
	if (uri === undefined) { 
		return vscode.window.showWarningMessage("user is on an untracked buffer: "+ user_hl.buffer);}
	let editor = await vscode.window.showTextDocument(uri, { preserveFocus: false });
	let range_start: vscode.Position = new vscode.Position(user_hl.startRow, user_hl.startCol);
	let range_end: vscode.Position = new vscode.Position(user_hl.endRow, user_hl.endCol);
	let cursor_range = new vscode.Range(range_start, range_end);
	editor.revealRange(cursor_range, vscode.TextEditorRevealType.InCenter);
}




export async function createBuffer() {
	let bufferName: any = (await vscode.window.showInputBox({ prompt: "path of the buffer to create" }));
	if (workspace === null) return vscode.window.showWarningMessage("Join a workspace first");
	await workspace.create(bufferName);
	vscode.window.showInformationMessage(`new buffer created :${bufferName}`);
	listBuffers();
	//provider.refresh();
}

export async function listBuffers() {
	if (workspace === null) return vscode.window.showWarningMessage("Join a workspace first");
	let buffers = workspace.filetree(undefined, false);
	vscode.window.showInformationMessage(buffers.join("\n"));
	provider.refresh();
}
