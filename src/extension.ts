import * as vscode from 'vscode';
import * as codemp from 'codemp';
import { client, connect, join, refresh, createWorkspace, inviteToWorkspace, listWorkspaces, leave } from './commands/client';
import { CodempTreeProvider } from './tree';
import * as mapping from './mapping';
import { workspace, jump, listBuffers, createBuffer, deleteBuffer, follow } from './commands/workspaces'
import { attach, share, sync, apply_changes_to_buffer, detach } from './commands/buffers'

export let provider = new CodempTreeProvider();

export let LOGGER = vscode.window.createOutputChannel("codemp", { log: true });

// extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// start codemp log poller

	log_poller_task(new codemp.JsLogger()); // don't await it! run it in background forever
	let sub = vscode.window.registerTreeDataProvider('codemp-tree-view', provider);
	context.subscriptions.push(sub);

	vscode.window.onDidChangeVisibleTextEditors(async (editors: readonly vscode.TextEditor[]) => {
		if (workspace === null) return;
		for (let editor of editors) {
			let path = mapping.bufferMapper.by_editor(editor.document.uri);
			if (!path) continue;
			let controller = workspace.buffer_by_name(path);
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
		vscode.commands.registerCommand('codemp.createBuffer', createBuffer),
		vscode.commands.registerCommand('codemp.listBuffers', listBuffers),
		vscode.commands.registerCommand('codemp.detach', detach),
		vscode.commands.registerCommand('codemp.deleteBuffer', deleteBuffer),
		vscode.commands.registerCommand('codemp.sync', sync),
		vscode.commands.registerCommand('codemp.refresh', refresh),
		vscode.commands.registerCommand('codemp.jump', jump),
		vscode.commands.registerCommand('codemp.follow', follow),
	]) {
		context.subscriptions.push(cmd);
	}
}

export async function deactivate() {
	if (client && workspace) {
		await client.leave_workspace(workspace.id());
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

