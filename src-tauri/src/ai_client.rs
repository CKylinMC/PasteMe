use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiActionRequest {
    pub action: AiActionKind,
    pub input: String,
    pub language: Option<String>,
    pub custom_prompt: Option<String>,
    pub api_key: String,
    pub base_url: String,
    pub model: Option<String>,
    #[serde(default)]
    pub temperature: Option<f32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AiActionResponse {
    pub result: String,
    pub used_prompt: String,
    pub finished_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AiActionKind {
    Translate,
    Summarize,
    Polish,
    Jsonify,
    Custom,
}

pub async fn perform(request: AiActionRequest) -> Result<AiActionResponse> {
    let api_key = request.api_key.trim().to_string();
    if api_key.is_empty() {
        anyhow::bail!("OpenAI compatible API key is not configured");
    }
    let base_url = request.base_url.trim().trim_end_matches('/');
    if base_url.is_empty() {
        anyhow::bail!("OpenAI compatible Base URL is missing");
    }

    let model = request
        .model
        .clone()
        .unwrap_or_else(|| "gpt-4o-mini".to_string());
    let (system_prompt, user_prompt) = build_prompts(&request);
    let payload = serde_json::json!({
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": request.temperature.unwrap_or(0.3_f32)
    });

    let client = reqwest::Client::new();
    let url = format!("{}/v1/chat/completions", base_url);
    let response = client
        .post(url)
        .bearer_auth(api_key)
        .json(&payload)
        .send()
        .await
        .context("failed to call OpenAI compatible endpoint")?;
    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        anyhow::bail!("AI provider responded with {}: {}", status, text);
    }
    let body: serde_json::Value = response
        .json()
        .await
        .context("failed to decode AI response")?;
    let choices = body
        .get("choices")
        .and_then(|v| v.as_array())
        .context("AI response does not include choices")?;
    let message = choices
        .first()
        .and_then(|choice| choice.get("message"))
        .and_then(|msg| msg.get("content"))
        .and_then(|content| content.as_str())
        .context("AI response does not include assistant message")?;

    Ok(AiActionResponse {
        result: message.trim().to_string(),
        used_prompt: user_prompt,
        finished_at: Utc::now(),
    })
}

fn build_prompts(request: &AiActionRequest) -> (String, String) {
    let language = request
        .language
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("zh-CN");

    match request.action {
        AiActionKind::Translate => (
            format!(
                "You are VibeClip Pro, a precise multilingual translator.
Respond in {} with a natural translation.",
                language
            ),
            format!("{}", request.input.trim()),
        ),
        AiActionKind::Summarize => (
            format!(
                "You are VibeClip Pro, an expert summarizer.
Summaries must be concise bullet points in {}.",
                language
            ),
            format!("Summarize the following content:\n{}", request.input.trim()),
        ),
        AiActionKind::Polish => (
            format!(
                "You are VibeClip Pro, a writing assistant who enhances clarity.
Keep the meaning but improve fluency in {}.",
                language
            ),
            format!("Improve the following content:\n{}", request.input.trim()),
        ),
        AiActionKind::Jsonify => (
            "You are VibeClip Pro, a data formatter returning strict JSON.".to_string(),
            format!(
                "Convert the following content into valid JSON. Use lowercase keys.\n{}",
                request.input.trim()
            ),
        ),
        AiActionKind::Custom => (
            request
                .custom_prompt
                .clone()
                .unwrap_or_else(|| "You are VibeClip Pro, a helpful assistant.".to_string()),
            request.input.trim().to_string(),
        ),
    }
}
