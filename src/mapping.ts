import * as vscode from 'vscode';
import * as codemp from 'codemp';

class BufferMapper {
	bufferToEditorMapping: Map<string, vscode.Uri> = new Map();
	editorToBufferMapping: Map<vscode.Uri, string> = new Map();

	public register(buffer: string, uri: vscode.Uri) {
		this.bufferToEditorMapping.set(buffer, uri);
		this.editorToBufferMapping.set(uri, buffer);
	}

	public by_buffer(name: string): vscode.TextEditor | undefined {
		let uri = this.bufferToEditorMapping.get(name);
		return vscode.window.visibleTextEditors.find((e) => e.document.uri == uri);
	}

	public by_editor(name: vscode.Uri): string | undefined {
		return this.editorToBufferMapping.get(name);
	}

	private constructor() { }

	public static instance = new BufferMapper();
}

// TODO rename maybe? mapper.bufferMapper is a little bit overkill
export let bufferMapper = BufferMapper.instance;

export class UserDecoration {
	decoration: vscode.TextEditorDecorationType | null;
	color: string;


	public constructor(event: codemp.Cursor) {
		let hash = codemp.hash(event.user || "anon");
		this.color = colors[hash % colors.length];
		this.decoration = null;
	}

	// TODO can we avoid disposing and recreating the decoration type every time?
	public apply(editor: vscode.TextEditor, event: codemp.Cursor) {
		if (this.decoration !== null) {
			this.decoration.dispose();
		}
		this.decoration = vscode.window.createTextEditorDecorationType({
			borderWidth: '1px',
			borderStyle: 'solid',
			borderColor: this.color,
		});
		const range_start: vscode.Position = new vscode.Position(event.startRow, event.startCol); // -1?
		const range_end: vscode.Position = new vscode.Position(event.endRow, event.endCol); // -1? idk if this works it's kinda funny, should test with someone with a working version of codemp
		const decorationRange = new vscode.Range(range_start, range_end);
		editor.setDecorations(this.decoration, [decorationRange]);
	}
}



const colors = [
	"red",
	"green",
	"blue",
];

export const colors_cache: Map<string, UserDecoration> = new Map();
