use std::collections::HashMap;

use tokio::sync::{broadcast, mpsc, watch::{self, Ref}};
use tracing::warn;

use crate::events::Event;

use super::{buffer::{BufferView, Buffer}, state::{User, UserCursor}};

#[derive(Debug, Clone)]
pub struct UsersView {
	watch: watch::Receiver<HashMap<String, User>>,
	op: mpsc::Sender<UserAction>,
}

impl UsersView { // TODO don't unwrap everything!
	pub fn borrow(&self) -> Ref<HashMap<String, User>> {
		return self.watch.borrow();
	}

	pub async fn add(&mut self, user: User) {
		self.op.send(UserAction::ADD{ user }).await.unwrap();
	}

	pub async fn remove(&mut self, name: String) {
		self.op.send(UserAction::REMOVE{ name }).await.unwrap();
	}

	pub async fn update(&mut self, user_name: String, cursor: UserCursor) {
		self.op.send(UserAction::CURSOR { name: user_name, cursor }).await.unwrap();
	}
}

#[derive(Debug, Clone)]
pub struct BuffersTreeView {
	watch: watch::Receiver<HashMap<String, BufferView>>,
	op: mpsc::Sender<BufferAction>,
}

impl BuffersTreeView {
	pub fn borrow(&self) -> Ref<HashMap<String, BufferView>> {
		return self.watch.borrow();
	}

	pub async fn add(&mut self, buffer: Buffer) {
		self.op.send(BufferAction::ADD { buffer }).await.unwrap();
	}

	pub async fn remove(&mut self, path: String) {
		self.op.send(BufferAction::REMOVE { path }).await.unwrap();
	}
}

pub struct WorkspaceView {
	rx: broadcast::Receiver<Event>,
	pub users: UsersView,
	pub buffers: BuffersTreeView,
}

impl WorkspaceView {
	pub async fn event(&mut self) -> Result<Event, broadcast::error::RecvError> {
		self.rx.recv().await
	}
}

// Must be clonable, containing references to the actual state maybe? Or maybe give everyone an Arc, idk
#[derive(Debug)]
pub struct Workspace {
	pub name: String,
	pub bus: broadcast::Sender<Event>,

	pub buffers: BuffersTreeView,
	pub users: UsersView,

	run_tx: watch::Sender<bool>,
	run_rx: watch::Receiver<bool>,
}

impl Drop for Workspace {
	fn drop(&mut self) {
		self.run_tx.send(false).unwrap_or_else(|e| warn!("could not stop workspace worker: {:?}", e));
	}
}

impl Workspace {
	pub fn new(name: String) -> Self {
		let (op_buf_tx, mut op_buf_rx) = mpsc::channel::<BufferAction>(32);
		let (op_usr_tx, mut op_usr_rx) = mpsc::channel::<UserAction>(32);
		let (run_tx, run_rx) = watch::channel::<bool>(true);
		let (buffer_tx, buffer_rx) = watch::channel::<HashMap<String, BufferView>>(HashMap::new());
		let (users_tx, users_rx) = watch::channel(HashMap::new());
		let (broadcast_tx, _broadcast_rx) = broadcast::channel::<Event>(32);

		let w = Workspace {
			name,
			bus: broadcast_tx,
			buffers: BuffersTreeView{ op: op_buf_tx, watch: buffer_rx },
			users: UsersView{ op: op_usr_tx, watch: users_rx },
			run_tx,
			run_rx,
		};

		w.users_worker(op_usr_rx, users_tx);    // spawn worker to handle users
		w.buffers_worker(op_buf_rx, buffer_tx); // spawn worker to handle buffers

		return w;
	}

	fn buffers_worker(&self, mut rx: mpsc::Receiver<BufferAction>, tx: watch::Sender<HashMap<String, BufferView>>) {
		let bus = self.bus.clone();
		let run = self.run_rx.clone();
		tokio::spawn(async move {
			let mut buffers : HashMap<String, Buffer> = HashMap::new();

			while run.borrow().to_owned() {
				// TODO handle these errors!!
				let action = rx.recv().await.unwrap();
				match action {
					BufferAction::ADD { buffer } => {
						buffers.insert(buffer.view().name.clone(), buffer);
					}
					BufferAction::REMOVE { path } => {
						buffers.remove(&path);
					}
				}
				tx.send(
					buffers.iter()
						.map(|(k, v)| (k.clone(), v.view()))
						.collect()
				).unwrap();
			}
		});
	}

	fn users_worker(&self, mut rx: mpsc::Receiver<UserAction>, tx: watch::Sender<HashMap<String, User>>) {
		let bus = self.bus.clone();
		let run = self.run_rx.clone();
		tokio::spawn(async move {
			let mut users : HashMap<String, User> = HashMap::new();

			while run.borrow().to_owned() {
				match rx.recv().await.unwrap() {
					UserAction::ADD { user } => {
						users.insert(user.name.clone(), user);
					},
					UserAction::REMOVE { name } => {
						if let None = users.remove(&name) {
							continue; // don't update channel since this was a no-op
						}
					},
					UserAction::CURSOR { name, cursor } => {
						if let Some(user) = users.get_mut(&name) {
							user.cursor = cursor.clone();
							bus.send(Event::Cursor{user: name, cursor}).unwrap();
						} else {
							continue; // don't update channel since this was a no-op
						}
					},
				}

				tx.send(
					users.iter()
						.map(|(k, u)| (k.clone(), u.clone()))
						.collect()
				).unwrap();
			}
		});
	}

	pub fn view(&self) -> WorkspaceView {
		WorkspaceView {
			rx: self.bus.subscribe(),
			users: self.users.clone(),
			buffers: self.buffers.clone(),
		}
	}
}

#[derive(Debug)]
pub enum UserAction {
	ADD {
		user: User,
	},
	REMOVE {
		name: String,
	},
	CURSOR {
		name: String,
		cursor: UserCursor,
	},
}

#[derive(Debug)]
pub enum BufferAction {
	ADD {
		buffer: Buffer,
	},
	REMOVE {
		path: String, // TODO remove by id?
	},
}

