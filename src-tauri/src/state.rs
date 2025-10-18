use std::collections::VecDeque;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};

pub struct AppStatus {
    listening: AtomicBool,
    offline: AtomicBool,
    self_copies: Mutex<VecDeque<String>>,
}

impl Default for AppStatus {
    fn default() -> Self {
        Self {
            listening: AtomicBool::new(true),
            offline: AtomicBool::new(false),
            self_copies: Mutex::new(VecDeque::with_capacity(8)),
        }
    }
}

impl AppStatus {
    pub fn listening(&self) -> bool {
        self.listening.load(Ordering::SeqCst)
    }

    pub fn offline(&self) -> bool {
        self.offline.load(Ordering::SeqCst)
    }

    pub fn set_listening(&self, value: bool) {
        self.listening.store(value, Ordering::SeqCst);
    }

    pub fn set_offline(&self, value: bool) {
        self.offline.store(value, Ordering::SeqCst);
    }

    pub fn toggle_listening(&self) -> bool {
        let previous = self.listening.fetch_xor(true, Ordering::SeqCst);
        !previous
    }

    pub fn toggle_offline(&self) -> bool {
        let previous = self.offline.fetch_xor(true, Ordering::SeqCst);
        !previous
    }

    pub fn mark_self_copy(&self, hash: String) {
        if let Ok(mut guard) = self.self_copies.lock() {
            guard.push_back(hash);
            if guard.len() > 32 {
                guard.pop_front();
            }
        }
    }

    pub fn consume_self_copy(&self, hash: &str) -> bool {
        if let Ok(mut guard) = self.self_copies.lock() {
            if let Some(index) = guard.iter().position(|candidate| candidate == hash) {
                guard.remove(index);
                return true;
            }
        }
        false
    }
}
