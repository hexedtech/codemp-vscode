
use std::{collections::HashMap, sync::Arc};
use tokio::sync::{mpsc, watch::{self, Ref}};
use tracing::error;

use crate::actor::workspace::Workspace;

#[derive(Debug, Clone)]
pub struct UserCursor{
	pub buffer: i64,
	pub x: i32,
	pub y: i32
}

#[derive(Debug, Clone)]
pub struct User {
	pub name: String,
	pub cursor: UserCursor,
}

#[derive(Debug)]
pub enum AlterState {
	ADD {
		key: String,
		// w: Workspace
	},
	REMOVE {
		key: String
	},
}

#[derive(Debug)]
pub struct StateManager {
	op_tx: mpsc::Sender<AlterState>, // TODO make method for this
	workspaces: watch::Receiver<HashMap<String, Arc<Workspace>>>,
	run: watch::Sender<bool>,
}

impl Drop for StateManager {
	fn drop(&mut self) {
		self.run.send(false).unwrap_or_else(|e| {
			error!("Could not stop StateManager worker: {:?}", e);
		})
	}
}

impl StateManager {
	pub fn new() -> Self {
		let (tx, mut rx) = mpsc::channel(32); // TODO quantify backpressure
		let (workspaces_tx, workspaces_rx) = watch::channel(HashMap::new());
		let (stop_tx, stop_rx) = watch::channel(true);

		let s = StateManager { 
			workspaces: workspaces_rx,
			op_tx: tx,
			run: stop_tx,
		};

		tokio::spawn(async move {
			let mut store = HashMap::new();
			let mut _users = HashMap::<String, User>::new();

			while stop_rx.borrow().to_owned() {
				if let Some(event) = rx.recv().await {
					match event {
						AlterState::ADD { key/*, w */} => {
							// store.insert(key, Arc::new(w)); // TODO put in hashmap
							// workspaces_tx.send(store.clone()).unwrap();
						},
						AlterState::REMOVE { key } => {
							store.remove(&key);
						},
					}
					workspaces_tx.send(store.clone()).unwrap();
				} else {
					break
				}
			}
		});

		return s;
	}

	pub fn workspaces_ref(&self) -> Ref<HashMap<String, Arc<Workspace>>> {
		self.workspaces.borrow()
	}

	// TODO wrap result of this func?
	pub async fn op(&self, op: AlterState) -> Result<(), mpsc::error::SendError<AlterState>> {
		self.op_tx.send(op).await
	}
}
