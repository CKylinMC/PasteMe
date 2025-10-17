use std::path::PathBuf;

use anyhow::Context;
use chrono::{DateTime, Duration, Utc};
use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};
use rusqlite::{named_params, params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};
use tauri::{AppHandle, Manager};

use crate::hash::compute_content_hash;
use crate::runtime_config::RuntimePreferences;

#[derive(Debug, Clone)]
pub struct DbState {
    path: PathBuf,
}

impl DbState {
    pub fn initialize(app: &AppHandle) -> anyhow::Result<Self> {
        let mut path = app
            .path()
            .app_data_dir()
            .context("failed to resolve application data directory")?;
        std::fs::create_dir_all(&path).context("failed to create application data directory")?;
        path.push("vibeclip_pro.db");
        let state = Self { path };
        state.migrate()?;
        Ok(state)
    }

    pub fn clone_for_thread(&self) -> Self {
        Self {
            path: self.path.clone(),
        }
    }

    fn connect(&self) -> anyhow::Result<Connection> {
        Connection::open(&self.path).context("failed to open sqlite connection")
    }

    fn migrate(&self) -> anyhow::Result<()> {
        let conn = self.connect()?;
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS clips (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind INTEGER NOT NULL,
                content TEXT NOT NULL,
                content_hash TEXT,
                preview TEXT,
                extra TEXT,
                is_pinned INTEGER NOT NULL DEFAULT 0,
                is_favorite INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_clips_created_at ON clips(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_clips_updated_at ON clips(updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_clips_favorite ON clips(is_favorite DESC, is_pinned DESC, updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_clips_hash ON clips(content_hash);
            CREATE INDEX IF NOT EXISTS idx_clips_kind ON clips(kind, updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_clips_pinned ON clips(is_pinned DESC, updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_clips_composite ON clips(is_favorite DESC, is_pinned DESC, kind, updated_at DESC);
            "#,
        )
        .context("failed to run migrations")?;
        self.ensure_content_hash_column(&conn)?;
        Ok(())
    }

    fn ensure_content_hash_column(&self, conn: &Connection) -> anyhow::Result<()> {
        let mut stmt = conn.prepare("PRAGMA table_info(clips)")?;
        let has_column = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(|res| res.ok())
            .any(|name| name == "content_hash");
        if !has_column {
            conn.execute("ALTER TABLE clips ADD COLUMN content_hash TEXT", [])?;
        }
        self.populate_missing_hashes(conn)?;
        Ok(())
    }

    fn populate_missing_hashes(&self, conn: &Connection) -> anyhow::Result<()> {
        let mut stmt = conn.prepare(
            "SELECT id, kind, content FROM clips WHERE content_hash IS NULL OR content_hash = ''",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, ClipKind>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?;
        for row in rows {
            let (id, kind, content) = row?;
            let hash = compute_content_hash(kind, &content);
            conn.execute(
                "UPDATE clips SET content_hash = ?1 WHERE id = ?2",
                params![hash, id],
            )?;
        }
        Ok(())
    }

    pub fn list(
        &self,
        query: Option<String>,
        limit: Option<u32>,
        offset: u32,
        include_favorites_first: bool,
    ) -> anyhow::Result<Vec<ClipItem>> {
        let conn = self.connect()?;
        let mut sql = String::from(
            "SELECT id, kind, content, content_hash, preview, extra, is_pinned, is_favorite, created_at, updated_at FROM clips",
        );
        let search_term = query
            .as_ref()
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string());
        if search_term.is_some() {
            sql.push_str(" WHERE content LIKE :pattern OR COALESCE(preview, '') LIKE :pattern");
        }
        if include_favorites_first {
            sql.push_str(" ORDER BY is_favorite DESC, is_pinned DESC, updated_at DESC");
        } else {
            sql.push_str(" ORDER BY is_pinned DESC, updated_at DESC");
        }
        if let Some(l) = limit {
            sql.push_str(&format!(" LIMIT {}", l));
        }
        if offset > 0 {
            sql.push_str(&format!(" OFFSET {}", offset));
        }
        let mut statement = conn.prepare(&sql)?;
        let rows = if let Some(ref value) = search_term {
            let pattern = format!("%{}%", value);
            statement.query_map(named_params! {":pattern": pattern.as_str()}, map_clip_row)?
        } else {
            statement.query_map([], map_clip_row)?
        };
        let items = rows.collect::<Result<Vec<_>, _>>()?;
        Ok(items)
    }

    pub fn get(&self, id: i64) -> anyhow::Result<Option<ClipItem>> {
        let conn = self.connect()?;
        Ok(conn
            .query_row(
                "SELECT id, kind, content, content_hash, preview, extra, is_pinned, is_favorite, created_at, updated_at FROM clips WHERE id = ?1",
                params![id],
                map_clip_row,
            )
            .optional()?)
    }

    pub fn upsert(&self, payload: ClipPayload) -> anyhow::Result<ClipItem> {
        let ClipPayload {
            kind,
            content,
            preview,
            extra,
            is_pinned,
            is_favorite,
            content_hash,
        } = payload;

        let hash = content_hash.unwrap_or_else(|| compute_content_hash(kind, &content));
        let now = Utc::now();
        let preview_ref = preview.as_deref();
        let extra_ref = extra.as_deref();
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        let existing: Option<i64> = tx
            .query_row(
                "SELECT id FROM clips WHERE content_hash = ?1 LIMIT 1",
                params![&hash],
                |row| row.get(0),
            )
            .optional()?;

        if let Some(id) = existing {
            tx.execute(
                "UPDATE clips SET content = ?1, content_hash = ?2, preview = COALESCE(?3, preview), extra = COALESCE(?4, extra), updated_at = ?5 WHERE id = ?6",
                params![&content, &hash, preview_ref, extra_ref, datetime_to_timestamp(now), id],
            )?;
            tx.commit()?;
            return self.get(id)?.context("failed to load inserted clip");
        }

        tx.execute(
            "INSERT INTO clips (kind, content, content_hash, preview, extra, is_pinned, is_favorite, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                i64::from(kind),
                &content,
                &hash,
                preview_ref,
                extra_ref,
                is_pinned as i64,
                is_favorite as i64,
                datetime_to_timestamp(now),
                datetime_to_timestamp(now)
            ],
        )?;
        let id = tx.last_insert_rowid();
        tx.commit()?;
        self.get(id)?.context("failed to load inserted clip")
    }

    pub fn update_flags(
        &self,
        id: i64,
        pinned: Option<bool>,
        favorite: Option<bool>,
    ) -> anyhow::Result<()> {
        log::info!(
            "update_flags called: id={}, pinned={:?}, favorite={:?}",
            id,
            pinned,
            favorite
        );

        if pinned.is_none() && favorite.is_none() {
            log::info!("update_flags: both flags are None, skipping update");
            return Ok(());
        }

        let conn = self.connect()?;
        let pinned_value = pinned.map(|value| if value { 1 } else { 0 });
        let favorite_value = favorite.map(|value| if value { 1 } else { 0 });

        log::info!(
            "update_flags: executing SQL with pinned_value={:?}, favorite_value={:?}",
            pinned_value,
            favorite_value
        );

        let rows_affected = conn.execute(
            "UPDATE clips SET \
                is_pinned = COALESCE(:pinned, is_pinned), \
                is_favorite = COALESCE(:favorite, is_favorite), \
                updated_at = :updated_at \
            WHERE id = :id",
            named_params! {
                ":pinned": pinned_value,
                ":favorite": favorite_value,
                ":updated_at": datetime_to_timestamp(Utc::now()),
                ":id": id,
            },
        )?;

        log::info!("update_flags: {} rows affected", rows_affected);

        if rows_affected == 0 {
            log::warn!("update_flags: no rows were updated for id={}", id);
        }

        Ok(())
    }

    pub fn update_content(
        &self,
        id: i64,
        content: String,
        preview: Option<String>,
    ) -> anyhow::Result<()> {
        let conn = self.connect()?;
        let kind: ClipKind =
            conn.query_row("SELECT kind FROM clips WHERE id = ?1", params![id], |row| {
                row.get(0)
            })?;
        let hash = compute_content_hash(kind, &content);
        conn.execute(
            "UPDATE clips SET content = ?1, content_hash = ?2, preview = ?3, updated_at = ?4 WHERE id = ?5",
            params![content, hash, preview, datetime_to_timestamp(Utc::now()), id],
        )?;
        Ok(())
    }

    pub fn delete(&self, id: i64) -> anyhow::Result<()> {
        let conn = self.connect()?;
        conn.execute("DELETE FROM clips WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn clear(&self) -> anyhow::Result<()> {
        let conn = self.connect()?;
        conn.execute("DELETE FROM clips", [])?;
        Ok(())
    }

    pub fn vacuum(&self) -> anyhow::Result<()> {
        let conn = self.connect()?;
        conn.execute_batch("VACUUM")?;
        Ok(())
    }

    pub fn export_all(&self) -> anyhow::Result<Vec<ClipItem>> {
        self.list(None, None, 0, true)
    }

    pub fn import_many(&self, items: Vec<ClipItem>) -> anyhow::Result<usize> {
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        let mut changes = 0usize;
        for item in items {
            let content_hash = if item.content_hash.is_empty() {
                compute_content_hash(item.kind, &item.content)
            } else {
                item.content_hash.clone()
            };
            tx.execute(
                "INSERT INTO clips (id, kind, content, content_hash, preview, extra, is_pinned, is_favorite, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    item.id,
                    i64::from(item.kind),
                    item.content,
                    content_hash,
                    item.preview,
                    item.extra,
                    item.is_pinned as i64,
                    item.is_favorite as i64,
                    datetime_to_timestamp(item.created_at),
                    datetime_to_timestamp(item.updated_at)
                ],
            )?;
            changes += 1;
        }
        tx.commit()?;
        Ok(changes)
    }

    pub fn prune_older_than(&self, keep_latest: usize) -> anyhow::Result<usize> {
        if keep_latest == 0 {
            return Ok(0);
        }
        let conn = self.connect()?;
        let mut stmt = conn
            .prepare("SELECT updated_at FROM clips ORDER BY updated_at DESC LIMIT 1 OFFSET ?1")?;
        let threshold: Option<i64> = stmt
            .query_row(params![(keep_latest as i64).saturating_sub(1)], |row| {
                row.get(0)
            })
            .optional()?;
        if let Some(threshold_ts) = threshold {
            let deleted = conn.execute(
                "DELETE FROM clips WHERE updated_at < ?1",
                params![threshold_ts],
            )?;
            Ok(deleted as usize)
        } else {
            Ok(0)
        }
    }

    pub fn prune_older_than_days(&self, max_age_days: u32) -> anyhow::Result<usize> {
        if max_age_days == 0 {
            return Ok(0);
        }
        let conn = self.connect()?;
        let threshold = Utc::now() - Duration::days(max_age_days as i64);
        let deleted = conn.execute(
            "DELETE FROM clips WHERE created_at < ?1",
            params![datetime_to_timestamp(threshold)],
        )?;
        Ok(deleted as usize)
    }

    pub fn apply_retention(&self, prefs: &RuntimePreferences) -> anyhow::Result<()> {
        if let Some(max_entries) = prefs.retention.max_entries {
            if max_entries > 0 {
                let _ = self.prune_older_than(max_entries);
            }
        }
        if let Some(days) = prefs.retention.max_age_days {
            if days > 0 {
                let _ = self.prune_older_than_days(days);
            }
        }
        Ok(())
    }
}

fn datetime_to_timestamp(dt: DateTime<Utc>) -> i64 {
    dt.timestamp()
}

fn timestamp_to_datetime(ts: i64) -> DateTime<Utc> {
    DateTime::from_timestamp(ts, 0).unwrap_or_else(|| {
        log::warn!(
            "invalid timestamp {} in database; falling back to current time",
            ts
        );
        Utc::now()
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipItem {
    pub id: i64,
    pub kind: ClipKind,
    pub content: String,
    #[serde(default)]
    pub content_hash: String,
    pub preview: Option<String>,
    pub extra: Option<String>,
    pub is_pinned: bool,
    pub is_favorite: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipPayload {
    pub kind: ClipKind,
    pub content: String,
    pub preview: Option<String>,
    pub extra: Option<String>,
    #[serde(default)]
    pub content_hash: Option<String>,
    #[serde(default)]
    pub is_pinned: bool,
    #[serde(default)]
    pub is_favorite: bool,
}

#[derive(Debug, Clone, Copy, Serialize_repr, Deserialize_repr)]
#[repr(u8)]
pub enum ClipKind {
    Text = 1,
    Image = 2,
    File = 3,
}

impl From<ClipKind> for i64 {
    fn from(value: ClipKind) -> Self {
        value as i64
    }
}

impl FromSql for ClipKind {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        match value.as_i64()? {
            1 => Ok(ClipKind::Text),
            2 => Ok(ClipKind::Image),
            3 => Ok(ClipKind::File),
            other => Err(FromSqlError::Other(Box::<
                dyn std::error::Error + Send + Sync,
            >::from(anyhow::anyhow!(
                "unknown clip kind value: {}",
                other
            )))),
        }
    }
}

impl ToSql for ClipKind {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::from(i64::from(*self)))
    }
}

fn map_clip_row(row: &Row<'_>) -> rusqlite::Result<ClipItem> {
    let created_at_ts: i64 = row.get(8)?;
    let updated_at_ts: i64 = row.get(9)?;
    Ok(ClipItem {
        id: row.get(0)?,
        kind: row.get(1)?,
        content: row.get(2)?,
        content_hash: row.get(3)?,
        preview: row.get(4)?,
        extra: row.get(5)?,
        is_pinned: row.get::<_, i64>(6)? == 1,
        is_favorite: row.get::<_, i64>(7)? == 1,
        created_at: timestamp_to_datetime(created_at_ts),
        updated_at: timestamp_to_datetime(updated_at_ts),
    })
}
