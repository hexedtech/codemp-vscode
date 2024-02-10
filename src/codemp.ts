import * as vscode from 'vscode';
import * as codemp from '../index'; // TODO why won't it work with a custom name???


var CACHE = new codemp.OpCache();
var BUFFERS : string[][] = [];
let smallNumberDecorationType = vscode.window.createTextEditorDecorationType({});

export async function connect() {
	let host = await vscode.window.showInputBox({prompt: "server host (default to http://alemi.dev:50052)"});
	if (host === undefined) return  // user cancelled with ESC
	if (host.length == 0) host = "http://alemi.dev:50052"
	await codemp.connect(host);
	vscode.window.showInformationMessage(`Connected to codemp @[${host}]`);
}


export async function join() {
	let workspace = await vscode.window.showInputBox({prompt: "workspace to attach (default to default)"});
	let buffer : string = (await vscode.window.showInputBox({prompt: "buffer name for the file needed to update other clients cursors"}))!;
	//let editor = vscode.window.activeTextEditor;
	if (workspace === undefined) return  // user cancelled with ESC
	if (workspace.length == 0) workspace = "default"

	if (buffer === undefined) return  // user cancelled with ESC
	if (buffer.length == 0) {workspace = "default"; buffer="fucl"; }
	
	let controller : codemp.JsCursorController = await codemp.join(workspace)
	controller.callback(( event:any) => {
		let buf : string = event.textEditor.document.uri.toString()
		let curPos  = vscode.window.activeTextEditor?.selection.active;
		let PosNumber : number = curPos?.line as number;
		let posizione : vscode.Position = new vscode.Position(0, PosNumber);
		let range_start : vscode.Position = new vscode.Position(event.start.row , event.start.col); // -1?
		let range_end : vscode.Position = new vscode.Position(event.end.row, event.end.col); // -1? idk if this works it's kinda funny, should test with someone with a working version of codemp
		const decorationRange = new vscode.Range(range_start, range_end);
		smallNumberDecorationType.dispose();
		smallNumberDecorationType = vscode.window.createTextEditorDecorationType({ 
			borderWidth: '5px',
			borderStyle: 'solid',
			overviewRulerColor: 'blue', 
			overviewRulerLane: vscode.OverviewRulerLane.Right,
			light: {
				// this color will be used in light color themes
				borderColor: 'darkblue' //should create this color based on event.user (uuid)
			},
			dark: {
				// this color will be used in dark color themes
				borderColor: 'lightblue' //should create this color based on event.user (uuid)
			}
		});
		for (let tuple of BUFFERS) {
			if (tuple[0].toString() === buf) {
				vscode.window.activeTextEditor?.setDecorations(smallNumberDecorationType, [decorationRange]);
			}
		}
	});


	vscode.window.onDidChangeTextEditorSelection((event: vscode.TextEditorSelectionChangeEvent) => {
		if (event.kind == vscode.TextEditorSelectionChangeKind.Command) return; // TODO commands might move cursor too
		let buf : string = event.textEditor.document.uri.toString()
		let selection : vscode.Selection = event.selections[0] // TODO there may be more than one cursor!!
		let anchor : [number, number] = [selection.anchor.line, selection.anchor.character];
		let position : [number, number] = [selection.active.line, selection.active.character+1];
		for (let tuple of BUFFERS) {
			if (tuple[0].toString() === buf) {
			controller.send(tuple[1], anchor, position);
			}
		}
	});
	vscode.window.showInformationMessage(`Connected to workspace @[${workspace}]`);
}


export async function createBuffer() {
	let workspace="default";//ask which workspace
	let bufferName : any = (await vscode.window.showInputBox({prompt: "path of the buffer to create"}))!;
	codemp.create(bufferName);
	console.log("new buffer created ", bufferName, "\n");
	let editor = vscode.window.activeTextEditor;

	if (editor === undefined) { return } // TODO say something!!!!!!

	/*let range = new vscode.Range(
		editor.document.positionAt(0),
		editor.document.positionAt(editor.document.getText().length)
	)*/
	let buffer : codemp.JsBufferController = await codemp.attach(bufferName);
	console.log("buffer");
	console.log(buffer);
	//let opSeq = {range.start,editor.document.getText(),range.end}
	//buffer.send(range.start,editor.document.getText(),range.end); //test it plz coded this at 10am :(
		buffer.send({
			span: { 
				start: 0,
				end: 0 //previous length is 0
			},
			content: editor.document.getText()
		});
		console.log("sent all the content", editor.document.getText());
	//Should i disconnect or stay attached to buffer???
}





export async function attach() {
	let buffer_name : any = (await vscode.window.showInputBox({prompt: "buffer to attach to"}))!;
	let buffer : codemp.JsBufferController = await codemp.attach(buffer_name);
	console.log("attached to buffer", buffer_name);
	console.log("buffer", buffer);
	let editor = vscode.window.activeTextEditor;

	if (editor === undefined) {
		let fileUri = buffer_name;
		let random = (Math.random() + 1).toString(36).substring(2);
		const fileName = ''+ random ;
		//const newFileUri = vscode.Uri.file(fileName).with({ scheme: 'untitled', path: fileName });

		//Create a document not a file so it's temp and it doesn't get saved
		const newFileUri = vscode.Uri.file(fileName).with({ scheme: 'untitled', path: "" });
		//vscode.workspace.openTextDocument()
		await vscode.workspace.openTextDocument(newFileUri);
		vscode.commands.executeCommand('vscode.open', newFileUri);
		//vscode.window.showInformationMessage(`Open a file first`);	
		//return;
	}
	editor = vscode.window.activeTextEditor!;
	//console.log("Buffer = ", buffer, "\n");
	vscode.window.showInformationMessage(`Connected to codemp workspace buffer  @[${buffer_name}]`);

	let file_uri : vscode.Uri = editor.document.uri;
	BUFFERS.push([file_uri, buffer_name]);

	vscode.workspace.onDidChangeTextDocument((event:vscode.TextDocumentChangeEvent) => {
		//console.log(event.reason);
		if (event.document.uri != file_uri) return; // ?
		for (let change of event.contentChanges) {
			if (CACHE.get(buffer_name, change.rangeOffset, change.text, change.rangeOffset + change.rangeLength)) continue;
			buffer.send({
				span: { 
					start: change.rangeOffset,
					end: change.rangeOffset+change.rangeLength
				},
				content: change.text
			});
		}
	});
	
	//await new Promise((resolve) => setTimeout(resolve, 200)); // tonioware
	//console.log("test");

	buffer.callback((event: any) => {
		CACHE.put(buffer_name, event.span.start, event.content, event.span.end);

		if (editor === undefined) { return } // TODO say something!!!!!!
		let range = new vscode.Range(
			editor.document.positionAt(event.span.start),
			editor.document.positionAt(event.span.end)
		)
		editor.edit(editBuilder => {
			editBuilder
				.replace(range, event.content)
		})
	});
}

export async function disconnectBuffer() {
	let buffer : string = (await vscode.window.showInputBox({prompt: "buffer name for the file to disconnect from"}))!;
	codemp.disconnectBuffer(buffer);
	vscode.window.showInformationMessage(`Disconnected from codemp workspace buffer  @[${buffer}]`);
}

export async function sync() {
	let editor = vscode.window.activeTextEditor;
	if (editor === undefined) { return }
	for (let tuple of BUFFERS) {
		console.log(tuple[0].toString());
		//console.log(tuple[1]);
		console.log("\n");
		console.log(editor?.document.uri.toString());
		//console.log(BUFFERS[0]);
		if (tuple[0].toString() === editor?.document.uri.toString()) {

			let buffer = await codemp.getBuffer(tuple[1]);
			if (buffer==null) {
				vscode.window.showErrorMessage("This buffer does not exist anymore");
				return;
			}
			let content = buffer.content();
			let range = new vscode.Range(
				editor.document.positionAt(0),
				editor.document.positionAt(editor.document.getText().length)
			);
			
			CACHE.put(tuple[1],0,content,editor.document.getText().length);
			editor.edit(editBuilder => editBuilder.replace(range, content));
			return;
		}
		else{
			vscode.window.showErrorMessage("This buffer is not managed by codemp");
		}
	}
}






// This method is called when your extension is deactivated
export function deactivate() {
//Maybe i should disconnect from every workspace and buffer ??? // TODO
}


