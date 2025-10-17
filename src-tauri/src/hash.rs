use blake3::Hasher;

use crate::db::ClipKind;

pub fn compute_content_hash(kind: ClipKind, content: &str) -> String {
    let mut hasher = Hasher::new();
    hasher.update(&[kind as u8]);
    hasher.update(content.as_bytes());
    hasher.finalize().to_hex().to_string()
}
