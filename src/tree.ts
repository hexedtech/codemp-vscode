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
				case Type.CurrentWorkspace:
					if (workspaceState.workspace === null) return []; // TODO ???? error maybe ???
					let items = workspaceState.workspace.searchBuffers().map((x) =>
						new CodempTreeItem(x, Type.Buffer, { active: bufferMapper.bufferToEditorMapping.has(x) })
					);
					items.push(new CodempTreeItem("", Type.Placeholder, { expandable: false }));
					items.push(new CodempTreeItem("Users", Type.UserContainer, { expandable: true }));
					return items;
				case Type.WorkspaceContainer:
					let active = workspaceState.workspace === null;
					return workspace_list
						.filter((x) => (
							workspaceState.workspace == null || (
								x.user != workspaceState.workspace.id().user && x.workspace != workspaceState.workspace.id().workspace
							)
						))
						.map((x) => new CodempTreeItem(`${x.user}/${x.workspace}`, Type.Workspace, { expandable: false, active: active }));

				case Type.UserContainer:
					let out = [];
					for (let x of colors_cache) {
						out.push(new CodempTreeItem(x[0], Type.User, { description: x[1].buffer }));
					};
					return out;

				case Type.ClientContainer:
					let info = [];
					if (client === null) return [];
					info.push(new CodempTreeItem("username", Type.ClientInfo, { description: client.currentUser().name }));
					info.push(Object.assign(new CodempTreeItem("uuid", Type.ClientInfo, {}), {
						description: client.currentUser().name,
						tooltip: `display name: ${client.currentUser().displayName ?? ""}`

					}));
					return info;

				case Type.Placeholder:
				case Type.User:
				case Type.Buffer:
				case Type.Workspace:
				case Type.ClientInfo:
				// default:
					return [];
			}
		} else {
			if (client === null) {
				return []; // empty screen with [connect] button
			}

			let items = [];

			if (workspaceState.workspace !== null) {
				let wsid = workspaceState.workspace.id();
				items.push(new CodempTreeItem(`${wsid.user}/${wsid.workspace}`, Type.CurrentWorkspace, { expandable: true }));
				items.push(new CodempTreeItem("", Type.Placeholder, {}));
			}

			items.push(new CodempTreeItem("Workspaces", Type.WorkspaceContainer, { expandable: true }));
			items.push(new CodempTreeItem("", Type.Placeholder, {}));
			items.push(new CodempTreeItem("Client", Type.ClientContainer, { expandable: true }));

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
		if (type === Type.WorkspaceContainer) this.iconPath = new vscode.ThemeIcon("extensions-remote");
		else if (type === Type.UserContainer) this.iconPath = new vscode.ThemeIcon("accounts-view-bar-icon");
		else if (type === Type.ClientContainer) this.iconPath = new vscode.ThemeIcon("broadcast");
		else if (type === Type.ClientInfo) this.iconPath = new vscode.ThemeIcon("chip");
		else if (type === Type.CurrentWorkspace) this.iconPath = new vscode.ThemeIcon("debug-breakpoint-data");
		else if (type === Type.Workspace) this.iconPath = new vscode.ThemeIcon("debug-breakpoint-data-unverified");
		else if (type === Type.Buffer) this.iconPath = new vscode.ThemeIcon(opts.active ? "debug-breakpoint-log" : "debug-breakpoint-log-unverified");
		else if (type === Type.User) this.iconPath = new vscode.ThemeIcon("debug-breakpoint-disabled");
	}
}

enum Type {
	WorkspaceContainer = "workspace_container",
	UserContainer = "user_container",
	ClientContainer = "client_container",
	ClientInfo = "client_info",
	CurrentWorkspace = "current_workspace",
	Workspace = "workspace",
	Buffer = "buffer",
	User = "user",
	Placeholder = "placeholder",
}
