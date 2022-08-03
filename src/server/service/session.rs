pub mod proto {
	tonic::include_proto!("session");
}

use std::sync::Arc;

use tracing::debug;

use tonic::{Request, Response, Status};

use proto::session_server::Session;
use proto::{SessionRequest, SessionResponse};

use crate::actor::{
	state::{AlterState, StateManager},
	workspace::Workspace as WorkspaceInstance, // TODO fuck x2!
};

#[derive(Debug)]
pub struct SessionService {
	state: Arc<StateManager>,
}

#[tonic::async_trait]
impl Session for SessionService {
	async fn create(
		&self,
		request: Request<SessionRequest>,
	) -> Result<Response<SessionResponse>, Status> {
		debug!("create request: {:?}", request);
		let r = request.into_inner();

		let _w = WorkspaceInstance::new(r.session_key.clone());

		let reply = proto::SessionResponse {
			session_key: r.session_key.clone(),
			accepted: true,
		};

		// self.tx.send(AlterState::ADD{key: r.session_key.clone(), w}).await.unwrap();

		Ok(Response::new(reply))
	}

	async fn join(
		&self,
		request: Request<SessionRequest>,
	) -> Result<Response<SessionResponse>, Status> {
		debug!("join request: {:?}", request);

		let reply = proto::SessionResponse {
			session_key: request.into_inner().session_key,
			accepted: true,
		};

		Ok(Response::new(reply))
	}

	async fn leave(
		&self,
		request: Request<SessionRequest>,
	) -> Result<Response<SessionResponse>, Status> {
		debug!("leave request: {:?}", request);
		let r = request.into_inner();
		let mut removed = false;

		if self.state.workspaces_ref().get(&r.session_key).is_some() {
			self.state
				.op(AlterState::REMOVE {
					key: r.session_key.clone(),
				})
				.await
				.unwrap();
			removed = true; // TODO this is a lie! Verify it
		}

		let reply = proto::SessionResponse {
			session_key: r.session_key,
			accepted: removed,
		};

		Ok(Response::new(reply))
	}
}
