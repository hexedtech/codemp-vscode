#![deny(clippy::all)]

pub mod client;
pub mod workspace;
pub mod cursor;
pub mod buffer;
pub mod op_cache;

#[derive(Debug)]
struct JsCodempError(codemp::Error);

impl From::<JsCodempError> for napi::Error {
	fn from(value: JsCodempError) -> Self {
		napi::Error::new(napi::Status::GenericFailure, &format!("CodempError: {:?}", value))
	}
}