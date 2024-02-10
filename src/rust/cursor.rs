use std::sync::Arc;
use napi_derive::napi;
use uuid::Uuid;
use napi::threadsafe_function::{ThreadsafeFunction, ThreadSafeCallContext, ThreadsafeFunctionCallMode, ErrorStrategy};
use codemp::api::Controller;
use crate::JsCodempError;

#[napi]
pub struct JsCursorController(Arc<codemp::cursor::Controller>);

impl From::<Arc<codemp::cursor::Controller>> for JsCursorController {
	fn from(value: Arc<codemp::cursor::Controller>) -> Self {
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
		let tsfn : ThreadsafeFunction<codemp::proto::cursor::CursorEvent, ErrorStrategy::Fatal> = 
		fun.create_threadsafe_function(0,
			|ctx : ThreadSafeCallContext<codemp::proto::cursor::CursorEvent>| {
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
					Err(codemp::Error::Deadlocked) => continue,
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
		let pos = codemp::proto::cursor::CursorPosition {
			buffer: buffer.into(),
			start: codemp::proto::cursor::RowCol::from(start),
			end: codemp::proto::cursor::RowCol::from(end),
		};
		Ok(self.0.send(pos).map_err(JsCodempError)?)
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

impl From::<codemp::proto::cursor::CursorEvent> for JsCursorEvent {
	fn from(value: codemp::proto::cursor::CursorEvent) -> Self {
		let pos = value.position;
		let start = pos.start;
		let end = pos.end;
		JsCursorEvent {
			user: Uuid::from(value.user).to_string(),
			buffer: pos.buffer.into(),
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

impl From::<codemp::proto::cursor::RowCol> for JsRowCol {
	fn from(value: codemp::proto::cursor::RowCol) -> Self {
		JsRowCol { row: value.row, col: value.col }
	}
}