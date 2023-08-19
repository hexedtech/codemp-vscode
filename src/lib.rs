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
pub async fn connect(addr: String) -> napi::Result<()> {
	CODEMP_INSTANCE.connect(&addr).await
		.map_err(|e| JsCodempError(e).into())
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

	#[napi]
	pub async fn recv(&self) -> napi::Result<JsCursorEvent> {
		Ok(
			self.0.recv().await
				.map_err(|e| napi::Error::from(JsCodempError(e)))?
				.into()
		)
	}

	#[napi]
	pub fn send(&self, buffer: String, start: (i32, i32), end: (i32, i32)) -> napi::Result<()> {
		let pos = CodempCursorPosition { buffer, start: Some(RowCol::from(start)), end: Some(RowCol::from(end)) };
		self.0.send(pos)
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

impl From::<OperationSeq> for JsCodempOperationSeq{
	fn from(value: OperationSeq) -> Self {
		JsCodempOperationSeq(value)
	}


}


impl From::<Arc<CodempBufferController>> for JsBufferController {
	fn from(value: Arc<CodempBufferController>) -> Self {
		JsBufferController(value)
	}
}


#[napi]
pub struct JsBufferController(Arc<CodempBufferController>);

#[napi(js_name = "CodempOperationSeq")]
pub struct JsCodempOperationSeq(CodempOperationSeq);




#[napi]
impl JsBufferController {

	#[napi]
	pub fn delta(&self, start: i64, txt: String, end: i64) -> Option<JsCodempOperationSeq> {
		self.0.delta(start as usize, &txt, end as usize).map(|x| x.into())
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
	pub fn send(&self, op: &JsCodempOperationSeq) -> napi::Result<()> {
		// TODO might be nice to take ownership of the opseq
		self.0.send(op.0.clone())
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





