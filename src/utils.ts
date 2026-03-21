import * as vscode from 'vscode';

export async function getOrPrompt(selected: vscode.TreeItem | undefined, opts: vscode.InputBoxOptions): Promise<string | null> {
	let out: string = "";

	if (selected !== undefined && selected.label !== undefined) {
		if (typeof (selected.label) === 'string') {
			out = selected.label;
		} else {
			out = selected.label.label;
		}
	}
	if (!out) {
		let response = await vscode.window.showInputBox(opts);
		if (response !== undefined) {
			out = response
		}
	}

	return out;
}

export async function getOrPick(selected: vscode.TreeItem | undefined, choices: string[], opts: vscode.QuickPickOptions): Promise<string | null> {
	let out: string | null = null;

	if (selected !== undefined && selected.label !== undefined) {
		if (typeof (selected.label) === 'string') {
			out = selected.label;
		} else {
			out = selected.label.label;
		}
	}
	if (!out) {
		let response = await vscode.window.showQuickPick(choices, opts);
		if (response !== undefined) {
			out = response
		}
	}

	return out;
}
