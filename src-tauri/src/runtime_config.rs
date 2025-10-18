use std::sync::{Arc, RwLock};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct RuntimePreferences {
    pub dedupe_enabled: bool,
    pub debounce_interval_ms: u64,
    pub ignore_self_copies: bool,
    pub ignored_keywords: Vec<String>,
    pub retention: RetentionPolicy,
    pub log_level: String,
}

impl Default for RuntimePreferences {
    fn default() -> Self {
        Self {
            dedupe_enabled: true,
            debounce_interval_ms: 320,
            ignore_self_copies: true,
            ignored_keywords: Vec::new(),
            retention: RetentionPolicy::default(),
            log_level: "info".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct RetentionPolicy {
    pub max_entries: Option<usize>,
    pub max_age_days: Option<u32>,
    pub vacuum_on_start: bool,
}

impl Default for RetentionPolicy {
    fn default() -> Self {
        Self {
            max_entries: Some(500),
            max_age_days: None,
            vacuum_on_start: true,
        }
    }
}

#[derive(Debug, Clone)]
pub struct RuntimeConfigState {
    inner: Arc<RwLock<RuntimePreferences>>,
}

impl Default for RuntimeConfigState {
    fn default() -> Self {
        Self {
            inner: Arc::new(RwLock::new(RuntimePreferences::default())),
        }
    }
}

impl RuntimeConfigState {
    pub fn get(&self) -> RuntimePreferences {
        self.inner
            .read()
            .map(|prefs| prefs.clone())
            .unwrap_or_default()
    }

    pub fn update(&self, prefs: RuntimePreferences) {
        if let Ok(mut state) = self.inner.write() {
            *state = prefs;
        }
    }
}
