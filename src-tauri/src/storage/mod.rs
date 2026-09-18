use std::path::PathBuf;

use anyhow::{Context, Result};
use chrono::Utc;
use parking_lot::Mutex;
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::storage::models::{
    AiJob, AiJobStage, AiJobStatus, ExportRecord, ProviderConfig, Session, SessionStatus,
    Screenshot, StoredEvent,
};

pub mod bundle;
pub mod models;

pub struct Database {
    conn: Mutex<Connection>,
    data_dir: PathBuf,
}

impl Database {
    pub fn new(app_data_dir: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&app_data_dir)?;
        let db_path = app_data_dir.join("flowcapture.db");
        let conn = Connection::open(&db_path).context("failed to open sqlite database")?;
        conn.execute("PRAGMA foreign_keys = ON", [])?;
        let db = Self {
            conn: Mutex::new(conn),
            data_dir: app_data_dir,
        };
        db.run_migrations()?;
        db.seed_default_providers()?;
        Ok(db)
    }

    pub fn session_dir(&self, session_id: &str) -> PathBuf {
        self.data_dir.join("sessions").join(session_id)
    }

    fn run_migrations(&self) -> Result<()> {
        let migration = include_str!("../../migrations/001_initial.sql");
        let conn = self.conn.lock();
        conn.execute_batch(migration)?;
        let _ = conn.execute("ALTER TABLE sessions ADD COLUMN audio_path TEXT", []);
        let _ = conn.execute("ALTER TABLE sessions ADD COLUMN audio_transcript TEXT", []);
        let _ = conn.execute("ALTER TABLE sessions ADD COLUMN full_video_path TEXT", []);
        let _ = conn.execute("ALTER TABLE sessions ADD COLUMN audio_segments_json TEXT", []);
        let _ = conn.execute("ALTER TABLE screenshots ADD COLUMN click_x INTEGER", []);
        let _ = conn.execute("ALTER TABLE screenshots ADD COLUMN click_y INTEGER", []);
        let _ = conn.execute("ALTER TABLE screenshots ADD COLUMN annotations_json TEXT", []);
        Ok(())
    }

    fn seed_default_providers(&self) -> Result<()> {
        let conn = self.conn.lock();
        let now = Utc::now().to_rfc3339();
        for (id, name, provider_type, base_url, model) in [
            (
                "openai",
                "OpenAI",
                "openai",
                "https://api.openai.com/v1",
                "gpt-4o-mini",
            ),
            (
                "claude",
                "Claude",
                "claude",
                "https://api.anthropic.com/v1",
                "claude-3-5-haiku-latest",
            ),
            (
                "ollama",
                "Ollama",
                "ollama",
                "http://localhost:11434",
                "llama3.2",
            ),
            (
                "gemini",
                "Gemini",
                "gemini",
                "https://generativelanguage.googleapis.com/v1beta",
                "gemini-2.5-flash",
            ),
        ] {
            conn.execute(
                "INSERT INTO providers (id, name, provider_type, base_url, model, enabled, created_at)
                 SELECT ?1, ?2, ?3, ?4, ?5, 0, ?6
                 WHERE NOT EXISTS (SELECT 1 FROM providers WHERE id = ?1)",
                params![id, name, provider_type, base_url, model, now],
            )?;
        }
        Ok(())
    }

    pub fn create_session(&self, title: Option<String>) -> Result<Session> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let title = title.unwrap_or_else(|| "Untitled Session".to_string());
        let session_dir = self.session_dir(&id);
        std::fs::create_dir_all(session_dir.join("screenshots"))?;
        std::fs::create_dir_all(session_dir.join("exports"))?;
        std::fs::create_dir_all(session_dir.join("frames"))?;

        self.conn.lock().execute(
            "INSERT INTO sessions (id, title, status, started_at) VALUES (?1, ?2, ?3, ?4)",
            params![id, title, SessionStatus::Recording.as_str(), now],
        )?;

        self.get_session(&id)?
            .ok_or_else(|| anyhow::anyhow!("failed to load created session"))
    }

    pub fn update_session_status(&self, session_id: &str, status: SessionStatus) -> Result<()> {
        self.conn.lock().execute(
            "UPDATE sessions SET status = ?1 WHERE id = ?2",
            params![status.as_str(), session_id],
        )?;
        Ok(())
    }

    pub fn finish_session(
        &self,
        session_id: &str,
        video_path: Option<String>,
        duration: i64,
    ) -> Result<()> {
        let ended_at = Utc::now().to_rfc3339();
        self.conn.lock().execute(
            "UPDATE sessions SET status = ?1, ended_at = ?2, video_path = ?3, duration = ?4 WHERE id = ?5",
            params![
                SessionStatus::Ready.as_str(),
                ended_at,
                video_path,
                duration,
                session_id
            ],
        )?;
        Ok(())
    }

    pub fn update_session_title(&self, session_id: &str, title: &str) -> Result<()> {
        self.conn.lock().execute(
            "UPDATE sessions SET title = ?1 WHERE id = ?2",
            params![title, session_id],
        )?;
        Ok(())
    }

    pub fn update_session_video_path(&self, session_id: &str, video_path: &str) -> Result<()> {
        self.conn.lock().execute(
            "UPDATE sessions SET video_path = ?1 WHERE id = ?2",
            params![video_path, session_id],
        )?;
        Ok(())
    }

    pub fn update_session_full_video_path(&self, session_id: &str, full_video_path: &str) -> Result<()> {
        self.conn.lock().execute(
            "UPDATE sessions SET full_video_path = ?1 WHERE id = ?2",
            params![full_video_path, session_id],
        )?;
        Ok(())
    }

    pub fn update_session_documentation(&self, session_id: &str, markdown: &str) -> Result<()> {
        self.conn.lock().execute(
            "UPDATE sessions SET documentation_md = ?1, status = ?2 WHERE id = ?3",
            params![markdown, SessionStatus::Ready.as_str(), session_id],
        )?;
        Ok(())
    }

    pub fn save_documentation(
        &self,
        session_id: &str,
        markdown: &str,
        steps_json: &str,
        compressed_events_json: &str,
    ) -> Result<()> {
        self.conn.lock().execute(
            "UPDATE sessions SET documentation_md = ?1, steps_json = ?2, compressed_events_json = ?3, status = ?4 WHERE id = ?5",
            params![
                markdown,
                steps_json,
                compressed_events_json,
                SessionStatus::Ready.as_str(),
                session_id
            ],
        )?;
        Ok(())
    }

    pub fn update_session_audio(&self, session_id: &str, audio_path: &str) -> Result<()> {
        self.conn.lock().execute(
            "UPDATE sessions SET audio_path = ?1 WHERE id = ?2",
            params![audio_path, session_id],
        )?;
        Ok(())
    }

    pub fn update_session_audio_transcript(&self, session_id: &str, transcript: &str) -> Result<()> {
        self.conn.lock().execute(
            "UPDATE sessions SET audio_transcript = ?1 WHERE id = ?2",
            params![transcript, session_id],
        )?;
        Ok(())
    }

    pub fn update_session_audio_segments(&self, session_id: &str, segments_json: &str) -> Result<()> {
        self.conn.lock().execute(
            "UPDATE sessions SET audio_segments_json = ?1 WHERE id = ?2",
            params![segments_json, session_id],
        )?;
        Ok(())
    }

    pub fn delete_session(&self, session_id: &str) -> Result<()> {
        let session_dir = self.session_dir(session_id);
        let _ = std::fs::remove_dir_all(&session_dir);
        self.conn.lock().execute(
            "DELETE FROM sessions WHERE id = ?1",
            params![session_id],
        )?;
        Ok(())
    }

    pub fn list_sessions(&self) -> Result<Vec<Session>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, title, status, started_at, ended_at, video_path, duration, documentation_md, steps_json, compressed_events_json, audio_path, audio_transcript, full_video_path, audio_segments_json FROM sessions ORDER BY started_at DESC",
        )?;
        let rows = stmt.query_map([], |row| Session::from_row(row))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn get_session(&self, session_id: &str) -> Result<Option<Session>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, title, status, started_at, ended_at, video_path, duration, documentation_md, steps_json, compressed_events_json, audio_path, audio_transcript, full_video_path, audio_segments_json FROM sessions WHERE id = ?1",
        )?;
        let mut rows = stmt.query(params![session_id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(Session::from_row(&row)?))
        } else {
            Ok(None)
        }
    }

    pub fn insert_events(&self, events: &[StoredEvent]) -> Result<()> {
        if events.is_empty() {
            return Ok(());
        }
        let conn = self.conn.lock();
        let tx = conn.unchecked_transaction()?;
        for event in events {
            tx.execute(
                "INSERT INTO events (id, session_id, event_type, app_name, payload, created_at, timestamp_ms) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    event.id,
                    event.session_id,
                    event.event_type,
                    event.app_name,
                    event.payload,
                    event.created_at,
                    event.timestamp_ms
                ],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn list_events(&self, session_id: &str) -> Result<Vec<StoredEvent>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, session_id, event_type, app_name, payload, created_at, timestamp_ms FROM events WHERE session_id = ?1 ORDER BY timestamp_ms ASC",
        )?;
        let rows = stmt.query_map(params![session_id], |row| StoredEvent::from_row(row))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn insert_screenshot(&self, screenshot: &Screenshot) -> Result<()> {
        self.conn.lock().execute(
            "INSERT INTO screenshots (id, session_id, path, timestamp_ms, trigger, selected, click_x, click_y, annotations_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                screenshot.id,
                screenshot.session_id,
                screenshot.path,
                screenshot.timestamp_ms,
                screenshot.trigger,
                screenshot.selected,
                screenshot.click_x,
                screenshot.click_y,
                screenshot.annotations_json,
            ],
        )?;
        Ok(())
    }

    pub fn list_screenshots(&self, session_id: &str) -> Result<Vec<Screenshot>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, session_id, path, timestamp_ms, trigger, selected, click_x, click_y, annotations_json FROM screenshots WHERE session_id = ?1 ORDER BY timestamp_ms ASC",
        )?;
        let rows = stmt.query_map(params![session_id], |row| Screenshot::from_row(row))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn session_preview_screenshot_path(&self, session_id: &str) -> Result<Option<String>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT path FROM screenshots WHERE session_id = ?1 ORDER BY timestamp_ms ASC",
        )?;
        let paths = stmt
            .query_map(params![session_id], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(preview_screenshot_path(&paths))
    }

    pub fn delete_screenshot(&self, screenshot_id: &str) -> Result<()> {
        self.conn.lock().execute(
            "DELETE FROM screenshots WHERE id = ?1",
            params![screenshot_id],
        )?;
        Ok(())
    }

    pub fn mark_screenshots_selected(&self, ids: &[String]) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "UPDATE screenshots SET selected = 0 WHERE session_id = (SELECT session_id FROM screenshots WHERE id = ?1 LIMIT 1)",
            params![ids.first().unwrap_or(&String::new())],
        )?;
        for id in ids {
            conn.execute(
                "UPDATE screenshots SET selected = 1 WHERE id = ?1",
                params![id],
            )?;
        }
        Ok(())
    }

    pub fn update_screenshot_annotations(
        &self,
        screenshot_id: &str,
        annotations_json: Option<&str>,
        click_x: Option<i64>,
        click_y: Option<i64>,
    ) -> Result<()> {
        self.conn.lock().execute(
            "UPDATE screenshots SET annotations_json = ?1, click_x = ?2, click_y = ?3 WHERE id = ?4",
            params![annotations_json, click_x, click_y, screenshot_id],
        )?;
        Ok(())
    }

    pub fn create_export(&self, export: &ExportRecord) -> Result<()> {
        self.conn.lock().execute(
            "INSERT INTO exports (id, session_id, format, path, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                export.id,
                export.session_id,
                export.format,
                export.path,
                export.created_at
            ],
        )?;
        Ok(())
    }

    pub fn list_exports(&self, session_id: &str) -> Result<Vec<ExportRecord>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, session_id, format, path, created_at FROM exports WHERE session_id = ?1 ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map(params![session_id], |row| ExportRecord::from_row(row))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
        let mut rows = stmt.query(params![key])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row.get(0)?))
        } else {
            Ok(None)
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        self.conn.lock().execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn list_providers(&self) -> Result<Vec<ProviderConfig>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, name, provider_type, api_key, base_url, model, enabled, created_at FROM providers ORDER BY name ASC",
        )?;
        let rows = stmt.query_map([], |row| ProviderConfig::from_row(row))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn update_provider(&self, provider: &ProviderConfig) -> Result<()> {
        self.conn.lock().execute(
            "UPDATE providers SET name = ?1, provider_type = ?2, api_key = ?3, base_url = ?4, model = ?5, enabled = ?6 WHERE id = ?7",
            params![
                provider.name,
                provider.provider_type,
                provider.api_key,
                provider.base_url,
                provider.model,
                provider.enabled,
                provider.id
            ],
        )?;
        Ok(())
    }

    pub fn get_enabled_provider(&self) -> Result<Option<ProviderConfig>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, name, provider_type, api_key, base_url, model, enabled, created_at FROM providers WHERE enabled = 1 LIMIT 1",
        )?;
        let mut rows = stmt.query([])?;
        if let Some(row) = rows.next()? {
            Ok(Some(ProviderConfig::from_row(&row)?))
        } else {
            Ok(None)
        }
    }

    pub fn create_ai_job(&self, session_id: &str, stage: AiJobStage) -> Result<AiJob> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.conn.lock().execute(
            "INSERT INTO ai_jobs (id, session_id, stage, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, session_id, stage.as_str(), AiJobStatus::Running.as_str(), now],
        )?;
        Ok(AiJob {
            id,
            session_id: session_id.to_string(),
            stage,
            status: AiJobStatus::Running,
            input_json: None,
            output_json: None,
            error: None,
            created_at: now,
            completed_at: None,
        })
    }

    pub fn finish_ai_job(
        &self,
        job_id: &str,
        status: AiJobStatus,
        output_json: Option<String>,
        error: Option<String>,
    ) -> Result<()> {
        let completed_at = Utc::now().to_rfc3339();
        self.conn.lock().execute(
            "UPDATE ai_jobs SET status = ?1, output_json = ?2, error = ?3, completed_at = ?4 WHERE id = ?5",
            params![status.as_str(), output_json, error, completed_at, job_id],
        )?;
        Ok(())
    }

    pub fn list_ai_jobs(&self, session_id: &str) -> Result<Vec<AiJob>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, session_id, stage, status, input_json, output_json, error, created_at, completed_at FROM ai_jobs WHERE session_id = ?1 ORDER BY created_at ASC",
        )?;
        let rows = stmt.query_map(params![session_id], |row| AiJob::from_row(row))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn insert_imported_session(
        &self,
        session: &Session,
        events: &[StoredEvent],
        screenshots: &[Screenshot],
        ai_jobs: &[AiJob],
        exports: &[ExportRecord],
    ) -> Result<()> {
        let mut conn = self.conn.lock();
        let tx = conn.transaction()?;

        tx.execute(
            "INSERT INTO sessions (
                id, title, status, started_at, ended_at, video_path, duration,
                documentation_md, steps_json, compressed_events_json, audio_path, audio_transcript
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                session.id,
                session.title,
                session.status,
                session.started_at,
                session.ended_at,
                session.video_path,
                session.duration,
                session.documentation_md,
                session.steps_json,
                session.compressed_events_json,
                session.audio_path,
                session.audio_transcript,
            ],
        )?;

        for event in events {
            tx.execute(
                "INSERT INTO events (id, session_id, event_type, app_name, payload, created_at, timestamp_ms)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    event.id,
                    event.session_id,
                    event.event_type,
                    event.app_name,
                    event.payload,
                    event.created_at,
                    event.timestamp_ms,
                ],
            )?;
        }

        for screenshot in screenshots {
            tx.execute(
                "INSERT INTO screenshots (id, session_id, path, timestamp_ms, trigger, selected, click_x, click_y, annotations_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    screenshot.id,
                    screenshot.session_id,
                    screenshot.path,
                    screenshot.timestamp_ms,
                    screenshot.trigger,
                    screenshot.selected,
                    screenshot.click_x,
                    screenshot.click_y,
                    screenshot.annotations_json,
                ],
            )?;
        }

        for job in ai_jobs {
            tx.execute(
                "INSERT INTO ai_jobs (id, session_id, stage, status, input_json, output_json, error, created_at, completed_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    job.id,
                    job.session_id,
                    job.stage.as_str(),
                    job.status.as_str(),
                    job.input_json,
                    job.output_json,
                    job.error,
                    job.created_at,
                    job.completed_at,
                ],
            )?;
        }

        for export in exports {
            tx.execute(
                "INSERT INTO exports (id, session_id, format, path, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    export.id,
                    export.session_id,
                    export.format,
                    export.path,
                    export.created_at,
                ],
            )?;
        }

        tx.commit()?;
        Ok(())
    }
}

fn preview_screenshot_path(paths: &[String]) -> Option<String> {
    if paths.is_empty() {
        return None;
    }

    let index = if paths.len() >= 4 {
        3
    } else if paths.len() >= 3 {
        2
    } else {
        paths.len() - 1
    };

    paths.get(index).cloned()
}
