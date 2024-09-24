import * as vscode from 'vscode';
import { client, workspace, workspace_list } from './commands';
import { bufferMapper, colors_cache } from './mapping';

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
					if(client === null) {
						return [];
					}
					if (workspace === null) { return [] };
					let workspaces= await client.list_workspaces(true,true);
					if(workspaces.length===0) { 
						let out = [];
						out.push(new CodempTreeItem("No workspaces", Type.Placeholder, false));
						return out;
					}
					if (element.label == workspace.id()) {
						return workspace.filetree(undefined, false).map((x) =>
							new CodempTreeItem(x, Type.Buffer, false, bufferMapper.bufferToEditorMapping.has(x))
						);
					} else {
						return [];
					}
				
				case Type.UserList:
					let out = [];
					
					/*colors_cache.forEach(function(x){
						out.push(new CodempTreeItem(x.color, Type.User, false));
					});*/
					for (let x of colors_cache){
						
						out.push(new CodempTreeItem(`${x[0]} (${x[1].buffer})`, Type.User, false));
					};
					return out;
				case Type.Buffer:
					return [];
				case Type.User:
					return [];
			}
			return [];
		} else {
			if(client === null) {
				return [];
			}
			let workspaces= await client.list_workspaces(true,true);
			if(workspaces.length===0) { 
				let out = [];
				out.push(new CodempTreeItem("No workspaces", Type.Placeholder, false));
				return out;
			}
			let items = workspace_list.map((x) =>
				new CodempTreeItem(x, Type.Workspace, true, workspace === null)
			);
			items.push(new CodempTreeItem("", Type.Placeholder, false));
			items.push(new CodempTreeItem("Users", Type.UserList, true));
			return items;
		}
	}
}

class CodempTreeItem extends vscode.TreeItem {
	type: Type;
	constructor(label: string | vscode.TreeItemLabel, type: Type, expandable: boolean, active?: boolean){
		let state = expandable ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None;
		super(label, state);
		this.type = type;
		this.contextValue = type;
		if (active) this.contextValue += "_active";
		if (type === Type.Workspace) this.iconPath = new vscode.ThemeIcon(active ? "timeline-pin" : "extensions-remote");
		else if (type === Type.Buffer) this.iconPath = new vscode.ThemeIcon(active ? "debug-restart-frame" : "debug-console-clear-all");
		else if (type === Type.UserList ) this.iconPath = new vscode.ThemeIcon("accounts-view-bar-icon");
		else if (type === Type.User ) this.iconPath = new vscode.ThemeIcon("debug-breakpoint-data-unverified");
	}
}

enum Type {
	Workspace = "workspace",
	UserList = "user_list",
	Buffer = "buffer",
	User = "user",
	Placeholder = "placeholder"
}
