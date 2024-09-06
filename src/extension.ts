import * as vscode from 'vscode';
import * as codemp from 'codemp';
import * as commands from './commands';
import { CodempTreeProvider } from './tree';

export let provider = new CodempTreeProvider();

export let LOGGER = vscode.window.createOutputChannel("codemp", { log: true });

// extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// start codemp log poller
	log_poller_task(new codemp.JsLogger()); // don't await it! run it in background forever
	let sub = vscode.window.registerTreeDataProvider('codemp-tree-view', provider);
	context.subscriptions.push(sub);

	// register commands: the commandId parameter must match the command field in package.json
	for (let cmd of [
		vscode.commands.registerCommand('codemp.connect', commands.connect),
		vscode.commands.registerCommand('codemp.join', commands.join),
		vscode.commands.registerCommand('codemp.attach', commands.attach),
		vscode.commands.registerCommand('codemp.createWorkspace', commands.createWorkspace),
		vscode.commands.registerCommand('codemp.listWorkspaces', commands.listWorkspaces),
		vscode.commands.registerCommand('codemp.createBuffer', commands.createBuffer),
		vscode.commands.registerCommand('codemp.listBuffers', commands.listBuffers),
		vscode.commands.registerCommand('codemp.sync', commands.sync),
	]) {
		context.subscriptions.push(cmd);
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
