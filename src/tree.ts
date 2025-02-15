import * as vscode from 'vscode';
import { workspace_list } from './commands/client';
import { bufferMapper, colors_cache } from './mapping';
import { COC } from "./extension";

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
					if (!COC.has_workspace()) return [];
					let items = COC.workspace().searchBuffers().map((x) =>
						new CodempTreeItem(x, Type.Buffer, { active: bufferMapper.bufferToEditorMapping.has(x) })
					);
					items.push(new CodempTreeItem("", Type.Placeholder, { expandable: false }));
					items.push(new CodempTreeItem("Users", Type.UserContainer, { expandable: true }));
					return items;
				case Type.WorkspaceContainer:
					let active = !COC.has_workspace();
					return workspace_list
						.filter((x) => x != COC.workspace().id())
						.map((x) => new CodempTreeItem(x, Type.Workspace, { expandable: false, active: active }));

				case Type.UserContainer:
					let out = [];
					for (let x of colors_cache) {
						out.push(new CodempTreeItem(x[0], Type.User, { description: x[1].buffer }));
					};
					return out;

				case Type.ClientContainer:
					let info = [];
					if (!COC.has_client()) return [];
					info.push(new CodempTreeItem("username", Type.ClientInfo, { description: COC.client().currentUser().name }));
					info.push(new CodempTreeItem("uuid", Type.ClientInfo, { description: COC.client().currentUser().uuid }));
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
			if (!COC.has_client()) {
				return []; // empty screen with [connect] button
			}

			let items = [];

			if (COC.has_workspace()) {
				items.push(new CodempTreeItem(COC.workspace().id(), Type.CurrentWorkspace, { expandable: true }));
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
		else if (type === Type.ClientContainer) this.iconPath = new vscode.ThemeIcon("");
		else if (type === Type.ClientInfo) this.iconPath = new vscode.ThemeIcon("");
		else if (type === Type.CurrentWorkspace) this.iconPath = new vscode.ThemeIcon("timeline-pin");
		else if (type === Type.Workspace) this.iconPath = new vscode.ThemeIcon("timeline-pin");
		else if (type === Type.Buffer) this.iconPath = new vscode.ThemeIcon(opts.active ? "debug-restart-frame" : "debug-console-clear-all");
		else if (type === Type.User) this.iconPath = new vscode.ThemeIcon("debug-breakpoint-data-unverified");
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
