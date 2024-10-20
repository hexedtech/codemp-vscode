import * as vscode from 'vscode';
import { client, workspace_list } from './commands/client';
import { workspaceState } from './commands/workspaces';
import { bufferMapper, colors_cache } from './mapping';

export class CodempTreeProvider implements vscode.TreeDataProvider<CodempTreeItem> {

	constructor() { }

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
					if (workspaceState.workspace === null) return [];
					else if (element.label == workspaceState.workspace.id()) {
						return workspaceState.workspace.searchBuffers().map((x) =>
							new CodempTreeItem(x, Type.Buffer, { active: bufferMapper.bufferToEditorMapping.has(x) })
						);
					} else return [];

				case Type.UserList: // asdasd
					let out = [];
					for (let x of colors_cache) {
						out.push(new CodempTreeItem(x[0], Type.User, { description: x[1].buffer }));
					};
					return out;

				case Type.Buffer:
					return [];

				case Type.User:
					return [];
			}
			return [];
		} else {
			if (client === null) {
				return []; // empty screen with [connect] button
			}
			let items = workspace_list.map((x) =>
				new CodempTreeItem(x, Type.Workspace, { expandable: true, active: workspaceState.workspace === null })
			);
			if (workspaceState.workspace !== null) {
				items.push(new CodempTreeItem("", Type.Placeholder, {}));
				items.push(new CodempTreeItem("Users", Type.UserList, { expandable: true }));
			}
			if (items.length == 0) {
				items.push(new CodempTreeItem("No workspaces", Type.Placeholder, {}));
			}
			return items;
		}
	}
}

class CodempTreeItem extends vscode.TreeItem {
	type: Type;
	constructor(label: string | vscode.TreeItemLabel, type: Type, opts: { description?: string, expandable?: boolean, active?: boolean }) {
		let state = opts.expandable ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None;
		super(label, state);
		this.type = type;
		this.contextValue = type;
		this.description = opts.description || "";
		if (opts.active) this.contextValue += "_active";
		if (type === Type.Workspace) this.iconPath = new vscode.ThemeIcon(opts.active ? "timeline-pin" : "extensions-remote");
		else if (type === Type.Buffer) this.iconPath = new vscode.ThemeIcon(opts.active ? "debug-restart-frame" : "debug-console-clear-all");
		else if (type === Type.UserList) this.iconPath = new vscode.ThemeIcon("accounts-view-bar-icon");
		else if (type === Type.User) this.iconPath = new vscode.ThemeIcon("debug-breakpoint-data-unverified");
	}
}

enum Type {
	Workspace = "workspace",
	UserList = "user_list",
	Buffer = "buffer",
	User = "user",
	Placeholder = "placeholder"
}
