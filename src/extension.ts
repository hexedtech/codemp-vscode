// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as codemp from '../index'; // TODO why won't it work with a custom name???
import * as codemplogic from './codemp';


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "codempvscode" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('codempvscode.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage(process.cwd());
	});
	let connectCommand = vscode.commands.registerCommand('codempvscode.connect', codemplogic.connect);
	let joinCommand = vscode.commands.registerCommand('codempvscode.join', codemplogic.join);
	let attachCommand = vscode.commands.registerCommand('codempvscode.attach', codemplogic.attach);
	let createBufferCommand = vscode.commands.registerCommand('codempvscode.createBuffer', codemplogic.createBuffer);
	let disconnectBufferCommand = vscode.commands.registerCommand('codempvscode.disconnectBuffer', codemplogic.disconnectBuffer);
	let syncBufferCommand = vscode.commands.registerCommand('codempvscode.sync', codemplogic.sync);
	context.subscriptions.push(connectCommand);
	context.subscriptions.push(joinCommand);
	context.subscriptions.push(attachCommand);
	context.subscriptions.push(createBufferCommand);
	context.subscriptions.push(disconnectBufferCommand);
	context.subscriptions.push(syncBufferCommand);
	context.subscriptions.push(disposable);
}




