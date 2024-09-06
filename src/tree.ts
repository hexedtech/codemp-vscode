import * as vscode from 'vscode';
import { client, workspace, workspace_list } from './commands';

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
						return [
							new CodempTreeItem("Buffers", Type.BufferContainer),
							new CodempTreeItem("Users", Type.UserContainer)
						];
					} else {
						return [];
					}
				case Type.BufferContainer:
					if (workspace === null) { return [] };
					return workspace.filetree().map((x) => new CodempTreeItem(x, Type.Buffer));
				case Type.UserContainer:
					if (workspace === null) { return [] };
					return [new CodempTreeItem("TODO", Type.User)]; // TODO keep track of users
				case Type.Buffer:
					return [];
				case Type.User:
					return [];
			}
		} else {
			if(client === null)	return [];
			return workspace_list.map((x) => new CodempTreeItem(x, Type.Workspace));
		}

	}
}

class CodempTreeItem extends vscode.TreeItem {
	type: Type;
	constructor(label: string | vscode.TreeItemLabel, type: Type){
		super(label, vscode.TreeItemCollapsibleState.Expanded);
		this.type=type;
	}
}

enum Type {
	Workspace,
	BufferContainer,
	UserContainer,
	Buffer,
	User,
}
