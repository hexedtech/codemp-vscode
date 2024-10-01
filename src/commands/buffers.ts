
import * as vscode from 'vscode';
import * as codemp from 'codemp';
import * as mapping from "../mapping";
import { workspace } from "./workspaces";
import { LOGGER, provider } from '../extension';

let locks: Map<string, boolean> = new Map();
let autoResync = vscode.workspace.getConfiguration('codemp').get<string>("autoResync");

export async function apply_changes_to_buffer(path: string, controller: codemp.BufferController, force?: boolean) {
	if (workspace === null) {
		LOGGER.info(`left workspace, unregistering buffer controller '${path}' callback`);
		controller.clear_callback();
		return;
	}

	let editor = mapping.bufferMapper.visible_by_buffer(path);
	if (editor === undefined) return;

	if (locks.get(path) && !force) return;
	locks.set(path, true);
	while (true) {
		let event = await controller.try_recv();
		if (event === null) break;
		LOGGER.debug(`buffer.callback(event: [${event.start}, ${event.content}, ${event.end}])`)

		let range = new vscode.Range(
			editor.document.positionAt(event.start),
			editor.document.positionAt(event.end)
		)

		await editor.edit(editBuilder => {
			editBuilder
				.replace(range, event.content)
		});

		if (event.hash !== undefined) {
			if (codemp.hash(editor.document.getText()) !== event.hash) {
				if (autoResync) {
					vscode.window.showWarningMessage("Out of Sync, resynching...");
					await resync(path, workspace, editor);
				} else {
					controller.clear_callback();
					const selection = await vscode.window.showWarningMessage('Out of Sync', 'Resync');
					if (selection !== undefined && workspace) await resync(path, workspace, editor);
				}
			}
		}
		locks.set(path, false);
	}
}

export async function attach_to_remote_buffer(buffer_name: string, set_content?: boolean): Promise<codemp.BufferController | undefined> {
	if (workspace === null) {
		vscode.window.showErrorMessage("join a Workspace first");
		return;
	}
	if (mapping.bufferMapper.visible_by_buffer(buffer_name) !== undefined) {
		vscode.window.showWarningMessage("buffer already attached");
		return;
	}
	if (vscode.workspace.workspaceFolders === undefined) {
		vscode.window.showErrorMessage("no active VSCode workspace, open a folder/project first");
		return;
	}

	let cwd = vscode.workspace.workspaceFolders[0].uri; // TODO picking the first one is a bit arbitrary
	let path = vscode.Uri.file(cwd.path + '/' + buffer_name);
	try {
		await vscode.workspace.fs.stat(path);
	} catch {
		path = path.with({ scheme: 'untitled' });
	}

	let doc = await vscode.workspace.openTextDocument(path);
	let editor = await vscode.window.showTextDocument(doc, { preserveFocus: false })
	await editor.edit((editor) => editor.setEndOfLine(vscode.EndOfLine.LF)); // set LF for EOL sequence
	let buffer: codemp.BufferController = await workspace.attach(buffer_name);

	// wait for server changes
	// TODO poll never unblocks, so this dirty fix is necessary
	let done = false;
	buffer.poll().then(() => done = true);
	for (let i = 0; i < 20; i++) {
		if (done) break;
		await new Promise(r => setTimeout(r, 100))
	}

	vscode.window.showInformationMessage(`Connected to buffer '${buffer_name}'`);
	LOGGER.info(`attached to buffer ${buffer_name}`);

	let file_uri: vscode.Uri = editor.document.uri;
	let remoteContent = await buffer.content();
	let localContent = editor.document.getText();

	if (set_content) {
		// make remote document match local content
		let doc_len = remoteContent.length;
		await buffer.send({ start: 0, end: doc_len, content: localContent });
	} else {
		// make local document match remote content
		let doc_len = localContent.length;

		let range = new vscode.Range(
			editor.document.positionAt(0),
			editor.document.positionAt(doc_len)
		);
		await editor.edit(editBuilder => {
			editBuilder
				.replace(range, remoteContent)
		});
	}

	let disposable = vscode.workspace.onDidChangeTextDocument(async (event: vscode.TextDocumentChangeEvent) => {
		if (locks.get(buffer_name)) { return }
		if (event.document.uri !== file_uri) return; // ?
		for (let change of event.contentChanges) {
			LOGGER.debug(`onDidChangeTextDocument(event: [${change.rangeOffset}, ${change.text}, ${change.rangeOffset + change.rangeLength}])`);
			await buffer.send({
				start: change.rangeOffset,
				end: change.rangeOffset + change.rangeLength,
				content: change.text
			});
		}
	});

	buffer.callback(async (controller: codemp.BufferController) =>
		await apply_changes_to_buffer(controller.get_path(), controller)
	);

	mapping.bufferMapper.register(buffer.get_path(), file_uri, disposable);

	provider.refresh();
}

export async function attach(selected: vscode.TreeItem | undefined) {
	if (workspace === null) return vscode.window.showWarningMessage("Join a workspace first");
	let buffer_name: string | undefined;
	if (selected !== undefined && selected.label !== undefined) {
		if (typeof (selected.label) === 'string') {
			buffer_name = selected.label;
		} else {
			buffer_name = selected.label.label; // TODO ughh what is this api?
		}
	} else {
		buffer_name = await vscode.window.showInputBox({ prompt: "path of buffer to attach to" });
	}
	if (!buffer_name) return;
	await attach_to_remote_buffer(buffer_name);
}

export async function detach(selected: vscode.TreeItem | undefined) {
	if (workspace === null) return vscode.window.showWarningMessage("Not in a workspace");
	let buffer_name: string | undefined;
	if (selected !== undefined && selected.label !== undefined) {
		if (typeof (selected.label) === 'string') {
			buffer_name = selected.label;
		} else {
			buffer_name = selected.label.label; // TODO ughh what is this api?
		}
	} else {
		buffer_name = await vscode.window.showInputBox({ prompt: "path of buffer to attach to" });
	}
	if (!buffer_name) return;
	let controller = workspace.buffer_by_name(buffer_name);
	if (controller) controller.clear_callback();
	workspace.detach(buffer_name);
	mapping.bufferMapper.remove(buffer_name);
	vscode.window.showInformationMessage(`Detached from buffer ${buffer_name}`)
}


export async function share(selected: vscode.TreeItem | undefined) {
	if (workspace === null) return vscode.window.showWarningMessage("Join a workspace first");
	let buffer_name: string | undefined;
	if (selected !== undefined && selected.label !== undefined) {
		if (typeof (selected.label) === 'string') {
			buffer_name = selected.label;
		} else {
			buffer_name = selected.label.label; // TODO ughh what is this api?
		}
	} else if (vscode.window.activeTextEditor !== null) {
		buffer_name = vscode.window.activeTextEditor?.document.uri.toString();
	} else {
		buffer_name = await vscode.window.showInputBox({ prompt: "path of buffer to attach to" });
	}
	if (!buffer_name) return; // action cancelled by user
	await attach_to_remote_buffer(buffer_name, true);
}

export async function sync(selected: vscode.TreeItem | undefined) {
	if (workspace === null) return vscode.window.showWarningMessage("Join a workspace first");
	let editor;
	let buffer_name;
	if (selected !== undefined && selected.label !== undefined) {
		if (typeof (selected.label) === 'string') {
			buffer_name = selected.label;
		} else {
			buffer_name = selected.label.label; // TODO ughh what is this api?
		}
		editor = mapping.bufferMapper.visible_by_buffer(buffer_name);
		if (editor === undefined) throw "no active editor to sync";
	} else {
		editor = vscode.window.activeTextEditor;
		if (editor === undefined) throw "no active editor to sync";
		buffer_name = mapping.bufferMapper.by_editor(editor.document.uri);
		if (buffer_name === undefined) throw "No such buffer managed by codemp"
	}

	locks.set(buffer_name, true);
	resync(buffer_name, workspace, editor);
	locks.set(buffer_name, false);
}

export async function resync(buffer_name: string, workspace: codemp.Workspace, editor: vscode.TextEditor) {

	let controller = workspace.buffer_by_name(buffer_name);
	if (controller === null) throw "No such buffer controller"

	let content = await controller.content();
	let doc_len = editor.document.getText().length;
	let range = new vscode.Range(
		editor.document.positionAt(0),
		editor.document.positionAt(doc_len)
	);

	await editor.edit(editBuilder => editBuilder.replace(range, content));

}
