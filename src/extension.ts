import * as vscode from 'vscode';
import * as codemp from '@codemp/codemp'; // TODO why won't it work with a custom name???
import * as codemplogic from './codemp';

export let LOGGER = vscode.window.createOutputChannel("codemp", { log: true });

// extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	console.log('Congratulations, your extension "codemp" is now active!');

	// start codemp log poller
	log_poller_task(new codemp.JsLogger()); // don't await it! run it in background forever

	// register commands: the commandId parameter must match the command field in package.json
	for (let cmd of [
		vscode.commands.registerCommand('codemp.connect', codemplogic.connect),
		vscode.commands.registerCommand('codemp.join', codemplogic.join),
		vscode.commands.registerCommand('codemp.attach', codemplogic.attach),
		vscode.commands.registerCommand('codemp.createWorkspace', codemplogic.createWorkspace),
		vscode.commands.registerCommand('codemp.listWorkspaces', codemplogic.listWorkspaces),
		vscode.commands.registerCommand('codemp.createBuffer', codemplogic.createBuffer),
		vscode.commands.registerCommand('codemp.listBuffers', codemplogic.listBuffers),
		vscode.commands.registerCommand('codemp.sync', codemplogic.sync),
	]) {
		context.subscriptions.push(cmd);
		console.log("registered all commands and pushed them");
	}
}

async function log_poller_task(logger: codemp.JsLogger) {
	console.log("starting logger task");
	while (true) {
		let message = await logger.message();
		if (message === null) break;
		console.log(message);
		LOGGER.info(message);
	}
	console.log("stopping logger task");
}