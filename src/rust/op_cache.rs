use std::collections::HashSet;
use napi_derive::napi;

pub type OpTuple = (String, u32, String, u32);

#[napi]
pub struct OpCache {
	store: HashSet<OpTuple>,
}

#[napi]
impl OpCache {
	#[napi(constructor)]
	pub fn new() -> Self {
		OpCache {
			store: HashSet::new(),
		}
	}

	#[napi]
	pub fn put(&mut self, buf: String, start: u32, text: String, end: u32) -> bool {
		let op = (buf, start, text, end);
		let res = self.store.contains(&op);
		self.store.insert(op);
		res
	}

	#[napi]
	pub fn get(&mut self, buf: String, start: u32, text: String, end: u32) -> bool {
		let op = (buf, start, text, end);
		if self.store.contains(&op) {
			self.store.remove(&op);
			true
		} else {
			false
		}
	}
}





#[cfg(test)]
mod test {
	#[test]
	fn op_cache_put_returns_whether_it_already_contained_the_key() {
		let mut op = super::OpCache::new();
		assert!(!op.put("default".into(), 0, "hello world".into(), 0)); // false: did not already contain it
		assert!(op.put("default".into(), 0, "hello world".into(), 0)); // true: already contained it
	}
	#[test]
	fn op_cache_contains_only_after_put() {
		let mut op = super::OpCache::new();
		assert!(!op.get("default".into(), 0, "hello world".into(), 0));
		op.put("default".into(), 0, "hello world".into(), 0);
		assert!(op.get("default".into(), 0, "hello world".into(), 0));
	}

	#[test]
	fn op_cache_different_keys(){
		let mut op = super::OpCache::new();
		assert!(!op.get("default".into(), 0, "hello world".into(), 0));
		op.put("default".into(), 0, "hello world".into(), 0);
		assert!(op.get("default".into(), 0, "hello world".into(), 0));
		assert!(!op.get("workspace".into(), 0, "hi".into(), 0));
		op.put("workspace".into(), 0, "hi".into(), 0);
		assert!(op.get("workspace".into(), 0, "hi".into(), 0));
	}

}