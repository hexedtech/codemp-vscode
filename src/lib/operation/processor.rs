use std::{sync::Mutex, collections::VecDeque};

use operational_transform::{OperationSeq, OTError};
use tokio::sync::watch;

use crate::operation::factory::OperationFactory;


#[tonic::async_trait]
pub trait OperationProcessor : OperationFactory {
	async fn apply(&self, op: OperationSeq) -> Result<String, OTError>;
	async fn process(&self, op: OperationSeq) -> Result<String, OTError>;

	async fn poll(&self) -> Option<OperationSeq>;
	async fn ack(&self)  -> Option<OperationSeq>;
	async fn wait(&self);
}


pub struct OperationController {
	text: Mutex<String>,
	queue: Mutex<VecDeque<OperationSeq>>,
	last: Mutex<watch::Receiver<OperationSeq>>,
	notifier: watch::Sender<OperationSeq>,
	changed: Mutex<watch::Receiver<()>>,
	changed_notifier: watch::Sender<()>,
}

impl OperationController {
	pub fn new(content: String) -> Self {
		let (tx, rx) = watch::channel(OperationSeq::default());
		let (done, wait) = watch::channel(());
		OperationController {
			text: Mutex::new(content),
			queue: Mutex::new(VecDeque::new()),
			last: Mutex::new(rx),
			notifier: tx,
			changed: Mutex::new(wait),
			changed_notifier: done,
		}
	}
}

impl OperationFactory for OperationController {
	fn content(&self) -> String {
		self.text.lock().unwrap().clone()
	}
}

#[tonic::async_trait]
impl OperationProcessor for OperationController {
	async fn apply(&self, op: OperationSeq) -> Result<String, OTError> {
		let txt = self.content();
		let res = op.apply(&txt)?;
		*self.text.lock().unwrap() = res.clone();
		self.queue.lock().unwrap().push_back(op.clone());
		self.notifier.send(op);
		Ok(res)
	}

	async fn wait(&self) {
		let mut blocker = self.changed.lock().unwrap().clone();
		blocker.changed().await;
		blocker.changed().await;
	}

	async fn process(&self, mut op: OperationSeq) -> Result<String, OTError> {
		let mut queue = self.queue.lock().unwrap();
		for el in queue.iter_mut() {
			(op, *el) = op.transform(el)?;
		}
		let txt = self.content();
		let res = op.apply(&txt)?;
		*self.text.lock().unwrap() = res.clone();
		self.changed_notifier.send(());
		Ok(res)
	}

	async fn poll(&self) -> Option<OperationSeq> {
		let len = self.queue.lock().unwrap().len();
		if len <= 0 {
			let mut recv = self.last.lock().unwrap().clone();
			// TODO this is not 100% reliable
			recv.changed().await; // acknowledge current state
			recv.changed().await; // wait for a change in state
		}
		Some(self.queue.lock().unwrap().get(0)?.clone())
	}

	async fn ack(&self) -> Option<OperationSeq> {
		self.queue.lock().unwrap().pop_front()
	}
}
