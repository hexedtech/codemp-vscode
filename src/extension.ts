import * as vscode from 'vscode';
import * as codemp from '../index'; // TODO why won't it work with a custom name???
import * as codemplogic from './codemp';

// extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	console.log('Congratulations, your extension "codempvscode" is now active!');

	// start codemp log poller
	let channel = vscode.window.createOutputChannel("codemp", {log: true});
	let logger = new codemp.JsLogger(false);
	log_poller_task(logger, channel); // don't await it! run it in background forever

	// register commands: the commandId parameter must match the command field in package.json
	for (let cmd of [
		vscode.commands.registerCommand('codempvscode.connect', codemplogic.connect),
		vscode.commands.registerCommand('codempvscode.login', codemplogic.login),
		vscode.commands.registerCommand('codempvscode.join', codemplogic.join),
		vscode.commands.registerCommand('codempvscode.attach', codemplogic.attach),
		vscode.commands.registerCommand('codempvscode.createBuffer', codemplogic.createBuffer),
		vscode.commands.registerCommand('codempvscode.listBuffers', codemplogic.listBuffers),
		// vscode.commands.registerCommand('codempvscode.disconnectBuffer', codemplogic.disconnectBuffer),
		vscode.commands.registerCommand('codempvscode.sync', codemplogic.sync),
	]) {
		context.subscriptions.push(cmd);
	}
}

async function log_poller_task(logger: codemp.JsLogger, channel: vscode.LogOutputChannel) {
	console.log("starting logger task");
	while (true) {
		let message = await logger.message();
		if (message === null) break;
		console.log(message);
		channel.info(message);
	}
	console.log("stopping logger task");
}