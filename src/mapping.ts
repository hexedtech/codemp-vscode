import * as vscode from 'vscode';
import * as codemp from 'codemp';

class BufferMapper {
	bufferToEditorMapping: Map<string, vscode.Uri> = new Map();
	bufferToDisposableMapping: Map<string, vscode.Disposable> = new Map();
	editorToBufferMapping: Map<vscode.Uri, string> = new Map();

	public register(buffer: string, uri: vscode.Uri, disposable: vscode.Disposable) {
		this.bufferToEditorMapping.set(buffer, uri);
		this.editorToBufferMapping.set(uri, buffer);
		this.bufferToDisposableMapping.set(buffer, disposable);
	}

	public uri_by_buffer(name: string): vscode.Uri | undefined {
		let uri = this.bufferToEditorMapping.get(name);
		return uri;
	}

	public visible_by_buffer(name: string): vscode.TextEditor | undefined {
		let uri = this.bufferToEditorMapping.get(name);
		return vscode.window.visibleTextEditors.find((e) => e.document.uri == uri);
	}

	public by_editor(name: vscode.Uri): string | undefined {
		return this.editorToBufferMapping.get(name);
	}

	public remove(name: string) {
		let uri = this.bufferToEditorMapping.get(name);
		let disposable = this.bufferToDisposableMapping.get(name);
		if (disposable) disposable.dispose();
		if (!uri) return;
		this.bufferToEditorMapping.delete(name);
		this.editorToBufferMapping.delete(uri);
		this.bufferToDisposableMapping.delete(name);
	}

	private constructor() { }

	public static instance = new BufferMapper();
}



// TODO rename maybe? mapper.bufferMapper is a little bit overkill
export let bufferMapper = BufferMapper.instance;

export class UserDecoration {
	decoration: vscode.TextEditorDecorationType | null;
	color: string;
	buffer: string;
	startRow: number
	startCol: number;
	endRow: number;
	endCol: number;

	public constructor(name: string) {
		let hash = codemp.hash(name);
		this.color = colors[Math.abs(hash) % colors.length];
		this.decoration = null;
		this.buffer = "";
		this.startRow = 0;
		this.startCol = 0;
		this.endRow = 0;
		this.endCol = 0;
	}

	// TODO can we avoid disposing and recreating the decoration type every time?
	public update(event: codemp.Cursor, editor?: vscode.TextEditor) {
		this.buffer = event.sel.buffer;
		this.startRow = event.sel.startRow;
		this.startCol = event.sel.startCol;
		this.endRow = event.sel.endRow;
		this.endCol = event.sel.endCol;
		if (this.decoration == null) {
			this.decoration = vscode.window.createTextEditorDecorationType({
				borderWidth: '1px',
				borderStyle: 'solid',
				borderColor: this.color,
				backgroundColor: this.color + '44', // add alpha
				border: "1px",
				//isWholeLine: true
				overviewRulerLane: vscode.OverviewRulerLane.Right,
				rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed

			});
		}

		const range_start: vscode.Position = new vscode.Position(event.sel.startRow, event.sel.startCol); // -1?
		const range_end: vscode.Position = new vscode.Position(event.sel.endRow, event.sel.endCol); // -1? idk if this works it's kinda funny, should test with someone with a working version of codemp
		const decorationRange = new vscode.Range(range_start, range_end);
		if (editor !== undefined) {
			editor.setDecorations(
				this.decoration,
				[{ range: decorationRange, hoverMessage: new vscode.MarkdownString(`### \`${event.user}\`'s cursor`) }]
			);
		}
	}

	public clear() {
		if (this.decoration !== null) {
			this.decoration.dispose();
		}
	}
}



const colors = [
	"#AC7EA8",
	"#81A1C1",
	"#EBD4A7",
	"#2E8757",
	"#BF616A",
	"#8F81D4",
	"#D69C63"
];

export const colors_cache: Map<string, UserDecoration> = new Map();

