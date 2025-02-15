import * as vscode from 'vscode';
import * as codemp from 'codemp';
import { connect, join, refresh, createWorkspace, inviteToWorkspace, listWorkspaces, leave, deleteWorkspace, version } from './commands/client';
import { CodempTreeProvider } from './tree';
import * as mapping from './mapping';
import { jump, listBuffers, createBuffer, deleteBuffer } from './commands/workspaces'
import { attach, share, sync, apply_changes_to_buffer, detach } from './commands/buffers'

export let provider = new CodempTreeProvider();

export let LOGGER = vscode.window.createOutputChannel("codemp", { log: true });

export class CodempObjectCache {
	private _client: codemp.Client | null = null;
	private _workspace: codemp.Workspace | null = null;

	public client(): codemp.Client {
		if (this._client === null) throw "Must connect first!";
		return this._client;
	}

	public has_client(): boolean {
		return this._client !== null;
	}

	public set_client(client: codemp.Client) {
		this._client = client;
	}

	public clear_client() {
		this._client = null;
	}

	public workspace(): codemp.Workspace {
		if (this._workspace === null) throw "Must join a workspace first";
		return this._workspace;
	}

	public has_workspace(): boolean {
		return this._workspace !== null;
	}

	public set_workspace(workspace: codemp.Workspace) {
		this._workspace = workspace;
	}

	public clear_workspace() {
		this._workspace = null;
	}
}

export let COC = new CodempObjectCache();

// extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	let config = vscode.workspace.getConfiguration('codemp');
	let debug = config.get<boolean>("debug");

	// start codemp log poller

	log_poller_task(new codemp.JsLogger(debug)); // don't await it! run it in background forever
	let sub = vscode.window.registerTreeDataProvider('codemp-tree-view', provider);
	context.subscriptions.push(sub);

	vscode.window.onDidChangeVisibleTextEditors(async (editors: readonly vscode.TextEditor[]) => {
		if (!COC.has_workspace()) return;
		for (let editor of editors) {
			let path = mapping.bufferMapper.by_editor(editor.document.uri);
			if (!path) continue;
			let controller = COC.workspace().getBuffer(path);
			if (!controller) continue;
			await apply_changes_to_buffer(path, controller, true);
		}
	});

	// register commands: the commandId parameter must match the command field in package.json
	for (let cmd of [
		vscode.commands.registerCommand('codemp.connect', connect),
		vscode.commands.registerCommand('codemp.join', join),
		vscode.commands.registerCommand('codemp.attach', attach),
		vscode.commands.registerCommand('codemp.share', share),
		vscode.commands.registerCommand('codemp.createWorkspace', createWorkspace),
		vscode.commands.registerCommand('codemp.inviteWorkspace', inviteToWorkspace),
		vscode.commands.registerCommand('codemp.listWorkspaces', listWorkspaces),
		vscode.commands.registerCommand('codemp.leave', leave),
		vscode.commands.registerCommand('codemp.deleteWorkspace', deleteWorkspace),
		vscode.commands.registerCommand('codemp.createBuffer', createBuffer),
		vscode.commands.registerCommand('codemp.listBuffers', listBuffers),
		vscode.commands.registerCommand('codemp.detach', detach),
		vscode.commands.registerCommand('codemp.deleteBuffer', deleteBuffer),
		vscode.commands.registerCommand('codemp.sync', sync),
		vscode.commands.registerCommand('codemp.refresh', refresh),
		vscode.commands.registerCommand('codemp.jump', jump),
		vscode.commands.registerCommand('codemp.version', version),
	]) {
		context.subscriptions.push(cmd);
	}
}

export async function deactivate() {
	if (COC.has_client() && COC.has_workspace()) {
		await COC.client().leaveWorkspace(COC.workspace().id());
	}
}

async function log_poller_task(logger: codemp.JsLogger) {
	while (true) {
		let message = await logger.message();
		if (message === null) break;
		LOGGER.info(message);
		console.log(message);
	}
}

