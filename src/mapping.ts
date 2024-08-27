import * as vscode from 'vscode';
import * as codemp from '@codemp/codemp'; // TODO why won't it work with a custom name???

class BufferMapper {
	bufferToEditorMapping: Map<string, vscode.TextEditor> = new Map();
	editorToBufferMapping: Map<vscode.Uri, string> = new Map();

	public register(buffer: string, editor: vscode.TextEditor) {
		this.bufferToEditorMapping.set(buffer, editor);
		this.editorToBufferMapping.set(editor.document.uri, buffer);
	}

	public by_buffer(name: string): vscode.TextEditor | undefined {
		return this.bufferToEditorMapping.get(name);
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
		let hash = codemp.hash(event.user!);
		this.color = colors[hash % colors.length];
		this.decoration = null;
	}

	// TODO can we avoid disposing and recreating the decoration type every time?
	public apply(editor: vscode.TextEditor, event: codemp.Cursor) {
		if (this.decoration !== null) {
			this.decoration.dispose();
		}
		this.decoration = vscode.window.createTextEditorDecorationType({
			borderWidth: '5px',
			borderStyle: 'solid',
			overviewRulerColor: 'blue',
			overviewRulerLane: vscode.OverviewRulerLane.Right,
			light: { borderColor: this.color },
			dark: { borderColor: this.color },
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