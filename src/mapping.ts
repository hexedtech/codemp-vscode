import * as vscode from 'vscode';
import * as codemp from '../index'; // TODO why won't it work with a custom name???

export class BufferMapping {
	buffer: codemp.JsBufferController;
	editor: vscode.TextEditor;

	constructor(codemp_buffer: codemp.JsBufferController, editor: vscode.TextEditor) {
		this.buffer = codemp_buffer;
		this.editor = editor;
	}
}

export class BufferMappingContainer {
	store: BufferMapping[];

	constructor() {
		this.store = [];
	}

	put(mapping: BufferMapping) {
		this.store.push(mapping);
	}

	get_by_editor(uri: vscode.Uri) : BufferMapping | null {
		for (let mapping of this.store) {
			if (mapping.editor.document.uri === uri)
				return mapping;
		}
		return null;
	}

	get_by_buffer(path: string) : BufferMapping | null {
		for (let mapping of this.store) {
			if (mapping.buffer.getName() === path)
				return mapping;
		}
		return null;
	}
}