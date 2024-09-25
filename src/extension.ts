import * as vscode from 'vscode';
import * as codemp from 'codemp';
import * as commands from './commands';
import { CodempTreeProvider } from './tree';
import * as mapping from './mapping';

export let provider = new CodempTreeProvider();

export let LOGGER = vscode.window.createOutputChannel("codemp", { log: true });

// extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// start codemp log poller

	log_poller_task(new codemp.JsLogger()); // don't await it! run it in background forever
	let sub = vscode.window.registerTreeDataProvider('codemp-tree-view', provider);
	context.subscriptions.push(sub);

	vscode.window.onDidChangeVisibleTextEditors(async (editors : readonly vscode.TextEditor[]) => {
		if(commands.workspace===null) return;
		for(let editor of editors){
			let path = mapping.bufferMapper.by_editor(editor.document.uri);
			if (path===undefined) continue;
			await commands.apply_changes_to_buffer(path, undefined, true);
		}
	});

	// register commands: the commandId parameter must match the command field in package.json
	for (let cmd of [
		vscode.commands.registerCommand('codemp.connect', commands.connect),
		vscode.commands.registerCommand('codemp.join', commands.join),
		vscode.commands.registerCommand('codemp.attach', commands.attach),
		vscode.commands.registerCommand('codemp.share', commands.share),
		vscode.commands.registerCommand('codemp.createWorkspace', commands.createWorkspace),
		vscode.commands.registerCommand('codemp.inviteWorkspace', commands.inviteToWorkspace),
		vscode.commands.registerCommand('codemp.listWorkspaces', commands.listWorkspaces),
		vscode.commands.registerCommand('codemp.leaveWorkspace', commands.leaveWorkspace),
		vscode.commands.registerCommand('codemp.createBuffer', commands.createBuffer),
		vscode.commands.registerCommand('codemp.listBuffers', commands.listBuffers),
		vscode.commands.registerCommand('codemp.sync', commands.sync),
		vscode.commands.registerCommand('codemp.refresh', commands.refresh),
		vscode.commands.registerCommand('codemp.jump', commands.jump),
	]) {
		context.subscriptions.push(cmd);
	}
}

export async function deactivate() {
	if (commands.client && commands.workspace) {
		await commands.client.leave_workspace(commands.workspace.id());
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


