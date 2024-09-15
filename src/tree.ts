import * as vscode from 'vscode';
import { client, workspace, workspace_list } from './commands';
import { bufferMapper } from './mapping';

export class CodempTreeProvider implements vscode.TreeDataProvider<CodempTreeItem> {

	constructor() {}

	private _emitter: vscode.EventEmitter<CodempTreeItem | undefined | null | void> = new vscode.EventEmitter<CodempTreeItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<CodempTreeItem | undefined | null | void> = this._emitter.event;

	refresh(): void {
		this._emitter.fire();
	}

	getTreeItem(element: CodempTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: CodempTreeItem): Promise<CodempTreeItem[]> {
		if (element) {
			switch (element.type) {
				case Type.Workspace:
					if (workspace === null) { return [] };
					if (element.label == workspace.id()) {
						// return [
						// 	new CodempTreeItem("Buffers", Type.BufferContainer, true),
						// 	new CodempTreeItem("Users", Type.UserContainer, true)
						// ];
						return workspace.filetree(undefined, false).map((x) =>
							new CodempTreeItem(x, Type.Buffer, false, bufferMapper.bufferToEditorMapping.has(x))
						);
					} else {
						return [];
					}
				case Type.BufferContainer:
					if (workspace === null) { return [] };
					return workspace.filetree(undefined, false).map((x) =>
						new CodempTreeItem(x, Type.Buffer, false, bufferMapper.bufferToEditorMapping.has(x))
					);
				case Type.UserContainer:
					if (workspace === null) { return [] };
					return [new CodempTreeItem("TODO", Type.User, false)]; // TODO keep track of users
				case Type.Buffer:
					return [];
				case Type.User:
					return [];
			}
		} else {
			if(client === null)	return [];
			return workspace_list.map((x) =>
				new CodempTreeItem(x, Type.Workspace, true, workspace !== null && workspace.id() == x)
			);
		}
	}
}

class CodempTreeItem extends vscode.TreeItem {
	type: Type;
	constructor(label: string | vscode.TreeItemLabel, type: Type, expandable: boolean, active?: boolean){
		let state = expandable ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None;
		console.log(type.toString());
		super(label, state);
		this.type = type;
		this.contextValue = type;
		if (active) this.contextValue += "_active";
		if (type === Type.Workspace) this.iconPath = new vscode.ThemeIcon(active ? "timeline-pin" : "extensions-remote");
		else if (type === Type.Buffer) this.iconPath = new vscode.ThemeIcon(active ? "debug-restart-frame" : "debug-console-clear-all");
	}
}

enum Type {
	Workspace = "workspace",
	BufferContainer = "container_buffer",
	UserContainer = "container_user",
	Buffer = "buffer",
	User = "user",
}
