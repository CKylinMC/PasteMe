use anyhow::{Context, Result};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use serde::{Deserialize, Serialize};

use crate::{
    db::{ClipKind, ClipPayload},
    hash::compute_content_hash,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardDraft {
    pub kind: ClipKind,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub image_base64: Option<String>,
    #[serde(default)]
    pub file_path: Option<String>,
    #[serde(default)]
    pub preview: Option<String>,
    #[serde(default)]
    pub extra: Option<String>,
    #[serde(default)]
    pub is_pinned: bool,
    #[serde(default)]
    pub is_favorite: bool,
}

impl ClipboardDraft {
    pub fn into_payload(self) -> Result<ClipPayload> {
        match self.kind {
            ClipKind::Text => {
                let content = self
                    .text
                    .context("Text clipboard payload is missing text field")?;
                let preview = self
                    .preview
                    .or_else(|| Some(content.chars().take(120).collect()));
                Ok(finalize_payload(ClipPayload {
                    kind: ClipKind::Text,
                    content,
                    preview,
                    extra: self.extra,
                    content_hash: None,
                    is_pinned: self.is_pinned,
                    is_favorite: self.is_favorite,
                }))
            }
            ClipKind::Image => {
                let image_base64 = self
                    .image_base64
                    .context("Image payload requires base64 data")?;
                validate_base64(&image_base64)?;
                let preview = self.preview.or_else(|| Some("图像".to_string()));
                Ok(finalize_payload(ClipPayload {
                    kind: ClipKind::Image,
                    content: image_base64.clone(),
                    preview,
                    extra: self.extra,
                    content_hash: None,
                    is_pinned: self.is_pinned,
                    is_favorite: self.is_favorite,
                }))
            }
            ClipKind::File => {
                let path = self
                    .file_path
                    .context("File clipboard payload is missing file_path")?;
                let preview = self.preview.or_else(|| Some(path.clone()));
                Ok(finalize_payload(ClipPayload {
                    kind: ClipKind::File,
                    content: path.clone(),
                    preview,
                    extra: self.extra,
                    content_hash: None,
                    is_pinned: self.is_pinned,
                    is_favorite: self.is_favorite,
                }))
            }
        }
    }
}

pub fn finalize_payload(mut payload: ClipPayload) -> ClipPayload {
    if payload.content_hash.is_none() {
        payload.content_hash = Some(compute_content_hash(payload.kind, &payload.content));
    }
    payload
}

fn validate_base64(data: &str) -> Result<()> {
    BASE64_STANDARD
        .decode(data.trim())
        .context("Invalid base64 data provided for image clipboard entry")?;
    Ok(())
}
