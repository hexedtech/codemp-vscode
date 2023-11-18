#![deny(clippy::all)]
use std::sync::Arc;
use codemp::{
	prelude::*,
	proto::{RowCol, CursorEvent},
};
use napi_derive::napi;
use napi::{Status, threadsafe_function::{ThreadSafeCallContext, ThreadsafeFunctionCallMode, ErrorStrategy::Fatal, ThreadsafeFunction}};
use napi::tokio;
#[derive(Debug)]
struct JsCodempError(CodempError);





impl From::<JsCodempError> for napi::Error {
	fn from(value: JsCodempError) -> Self {
		napi::Error::new(Status::GenericFailure, &format!("CodempError: {:?}", value))
	}
}


#[napi]
pub async fn connect(addr: String) -> napi::Result<()> {
	let f = std::fs::File::create("/home/***REMOVED***/projects/codemp/mine/codempvscode/***REMOVED***.txt").unwrap();
	tracing_subscriber::fmt()
		.with_ansi(false)
		.with_max_level(tracing::Level::INFO)
		.with_writer(std::sync::Mutex::new(f))
		.init();
	CODEMP_INSTANCE.connect(&addr).await
		.map_err(|e| JsCodempError(e).into())
}


#[napi]
pub async fn leave_workspace() -> Result<(), napi::Error> {
	CODEMP_INSTANCE.leave_workspace().await.map_err(|e| napi::Error::from(JsCodempError(e)))
}

#[napi]
pub async fn disconnect_buffer(path: String) -> Result<bool, napi::Error> {
	CODEMP_INSTANCE.disconnect_buffer(&path).await.map_err(|e| napi::Error::from(JsCodempError(e)))
}



/// CURSOR

#[napi]
pub async fn join(session: String) -> napi::Result<JsCursorController> {
	let controller = CODEMP_INSTANCE.join(&session).await
		.map_err(|e| napi::Error::from(JsCodempError(e)))?;
	Ok(controller.into())
}

#[napi]
pub struct JsCursorController(Arc<CodempCursorController>);

impl From::<Arc<CodempCursorController>> for JsCursorController {
	fn from(value: Arc<CodempCursorController>) -> Self {
		JsCursorController(value)
	}
}

#[napi]
impl JsCursorController {


	/*#[napi]
	pub fn call_threadsafe_recv(callback: JsFunction) -> Result<()>{
		let tsfn: ThreadsafeFunction<u32, ErrorStrategy::CalleeHandled> =
    callback.create_threadsafe_function(0, |ctx| Ok(vec![ctx.value + 1]))?;
	}*/

	#[napi(ts_args_type = "fun: (event: JsCursorEvent) => void")]
	pub fn callback(&self, fun: napi::JsFunction) -> napi::Result<()>{ 
		let tsfn : ThreadsafeFunction<CodempCursorEvent, Fatal> = 
		fun.create_threadsafe_function(0,
			|ctx : ThreadSafeCallContext<CodempCursorEvent>| {
				Ok(vec![JsCursorEvent::from(ctx.value)])
			}
		)?;
		let _controller = self.0.clone();
		tokio::spawn(async move {
			loop {
				match _controller.recv().await {
					Ok(event) => {
						tsfn.call(event.clone(), ThreadsafeFunctionCallMode::NonBlocking); //check this shit with tracing also we could use Ok(event) to get the error
					},
					Err(CodempError::Deadlocked) => continue,
					Err(e) => break tracing::warn!("error receiving: {}", e),
				}
			}
		});
		Ok(())
	}


	// let controller = codemp.join('default').await
	// // TODO register cursor callback, when cursormoved call { controller.send(event) }
	// controller.callback( (ev) => {
	// 		editor.change(event.tex)
	// });






	// #[napi]
	// pub async fn recv(&self) -> napi::Result<JsCursorEvent> {
	// 	Ok(
	// 		self.0.recv().await
	// 			.map_err(|e| napi::Error::from(JsCodempError(e)))?
	// 			.into()
	// 	)
	// }

	#[napi]
	pub fn send(&self, buffer: String, start: (i32, i32), end: (i32, i32)) -> napi::Result<()> {
		let pos = CodempCursorPosition { buffer, start: Some(RowCol::from(start)), end: Some(RowCol::from(end)) };
		self.0.send(pos)
				.map_err(|e| napi::Error::from(JsCodempError(e)))
	}
}

#[derive(Debug)]
#[napi(object)]
pub struct JsCursorEvent {
	pub user: String,
	pub buffer: String,
	pub start: JsRowCol,
	pub end: JsRowCol,
}

impl From::<CursorEvent> for JsCursorEvent {
	fn from(value: CursorEvent) -> Self {
		let pos = value.position.unwrap_or_default();
		let start = pos.start.unwrap_or_default();
		let end = pos.end.unwrap_or_default();
		JsCursorEvent {
			user: value.user,
			buffer: pos.buffer,
			start: JsRowCol { row: start.row, col: start.col },
			end: JsRowCol { row: end.row, col: end.col },
		}
	}
}

#[derive(Debug)]
#[napi(object)]
pub struct JsRowCol {
	pub row: i32,
	pub col: i32
}

impl From::<RowCol> for JsRowCol {
	fn from(value: RowCol) -> Self {
		JsRowCol { row: value.row, col: value.col }
	}
}



/// BUFFER
#[napi(object)]
pub struct JsTextChange {
	pub span: JsRange,
	pub content: String,
}
#[napi(object)]
pub struct JsRange{
	pub start: i32,
	pub end: i32,
}

impl From::<CodempTextChange> for JsTextChange {
	fn from(value: CodempTextChange) -> Self {
		JsTextChange {
			// TODO how is x.. represented ? span.end can never be None
			span: JsRange { start: value.span.start as i32, end: value.span.end as i32 },
			content: value.content,
		}
	}
}


impl From::<Arc<CodempBufferController>> for JsBufferController {
	fn from(value: Arc<CodempBufferController>) -> Self {
		JsBufferController(value)
	}
}


#[napi]
pub struct JsBufferController(Arc<CodempBufferController>);


/*#[napi]
pub fn delta(string : String, start: i64, txt: String, end: i64 ) -> Option<JsCodempOperationSeq> {
	Some(JsCodempOperationSeq(string.diff(start as usize, &txt, end as usize)?))
}*/






#[napi]
impl JsBufferController {


	#[napi(ts_args_type = "fun: (event: JsTextChange) => void")]
	pub fn callback(&self, fun: napi::JsFunction) -> napi::Result<()>{ 
		let tsfn : ThreadsafeFunction<CodempTextChange, Fatal> = 
		fun.create_threadsafe_function(0,
			|ctx : ThreadSafeCallContext<CodempTextChange>| {
				Ok(vec![JsTextChange::from(ctx.value)])
			}
		)?;
		let _controller = self.0.clone();
		tokio::spawn(async move {
			tokio::time::sleep(std::time::Duration::from_millis(200)).await;
			loop {
				match _controller.recv().await {
					Ok(event) => {
						tsfn.call(event.clone(), ThreadsafeFunctionCallMode::NonBlocking); //check this shit with tracing also we could use Ok(event) to get the error
					},
					Err(CodempError::Deadlocked) => continue,
					Err(e) => break tracing::warn!("error receiving: {}", e),
				}
			}
		});
		Ok(())
	}


	#[napi]
	pub async fn recv(&self) -> napi::Result<JsTextChange> {
		Ok(
			self.0.recv().await
				.map_err(|e| napi::Error::from(JsCodempError(e)))?
				.into()
		)
	}

	#[napi]
	pub fn send(&self, op: JsTextChange) -> napi::Result<()> {
		// TODO might be nice to take ownership of the opseq
		let new_text_change = CodempTextChange {
			span: op.span.start as usize .. op.span.end as usize,
			content: op.content,
		};
		self.0.send(new_text_change)
				.map_err(|e| napi::Error::from(JsCodempError(e)))
	}
}

#[napi]
pub async fn create(path: String, content: Option<String>) -> napi::Result<()> {
	CODEMP_INSTANCE.create(&path, content.as_deref()).await
		.map_err(|e| napi::Error::from(JsCodempError(e)))
}

#[napi]
pub async fn attach(path: String) -> napi::Result<JsBufferController> {
	Ok(
		CODEMP_INSTANCE.attach(&path).await
			.map_err(|e| napi::Error::from(JsCodempError(e)))?
			.into()
	)
}
