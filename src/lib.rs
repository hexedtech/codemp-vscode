#![deny(clippy::all)]

use std::sync::Arc;
use futures::prelude::*;
use napi::bindgen_prelude::*;
use codemp::{
	prelude::*,
	proto::{RowCol, CursorEvent},
	buffer::factory::OperationFactory, ot::OperationSeq
};
use napi_derive::napi;
use napi::tokio::{self, fs};

#[derive(Debug)]
struct JsCodempError(CodempError);

impl From::<JsCodempError> for napi::Error {
	fn from(value: JsCodempError) -> Self {
		napi::Error::new(Status::GenericFailure, &format!("CodempError: {:?}", value))
	}
}

#[napi]
pub fn connect(addr: String) -> napi::Result<()> {
	CODEMP_INSTANCE.connect(&addr)
		.map_err(|e| JsCodempError(e).into())
}



/// CURSOR

#[napi]
pub fn join(session: String) -> napi::Result<JsCursorController> {
	let controller = CODEMP_INSTANCE.join(&session)
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

	#[napi]
	pub async fn recv(&self) -> napi::Result<JsCursorEvent> {
		Ok(
			self.0.recv().await
				.map_err(|e| napi::Error::from(JsCodempError(e)))?
				.into()
		)
	}

	#[napi]
	pub async fn send(&self, buffer: String, start: (i32, i32), end: (i32, i32)) -> napi::Result<()> {
		let pos = CodempCursorPosition { buffer, start: Some(RowCol::from(start)), end: Some(RowCol::from(end)) };
		self.0.send(pos).await
				.map_err(|e| napi::Error::from(JsCodempError(e)))
	}
}

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
	pub span: JSRange,
	pub content: String,
}
#[napi(object)]
pub struct JSRange{
	pub start: i32,
	pub end: Option<i32>,
}

impl From::<CodempTextChange> for JsTextChange {
	fn from(value: CodempTextChange) -> Self {
		JsTextChange {
			// TODO how is x.. represented ? span.end can never be None
			span: JSRange { start: value.span.start as i32, end: Some(value.span.end as i32) },
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


#[napi]
impl JsBufferController {

	#[napi]
	pub async fn recv(&self) -> napi::Result<JsTextChange> {
		Ok(
			self.0.recv().await
				.map_err(|e| napi::Error::from(JsCodempError(e)))?
				.into()
		)
	}

	//#[napi]
	pub async fn send(&self, op: OperationSeq) -> napi::Result<()> {
		self.0.send(op).await
				.map_err(|e| napi::Error::from(JsCodempError(e)))
	}


}

#[napi]
pub fn create(path: String, content: Option<String>) -> napi::Result<()> {
	CODEMP_INSTANCE.create(&path, content.as_deref())
		.map_err(|e| napi::Error::from(JsCodempError(e)))
}

#[napi]
pub fn attach(path: String) -> napi::Result<JsBufferController> {
	Ok(
		CODEMP_INSTANCE.attach(&path)
			.map_err(|e| napi::Error::from(JsCodempError(e)))?
			.into()
	)
}





