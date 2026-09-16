use rusqlite::Row;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Idle,
    Recording,
    Processing,
    Ready,
    Exported,
}

impl SessionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Idle => "idle",
            Self::Recording => "recording",
            Self::Processing => "processing",
            Self::Ready => "ready",
            Self::Exported => "exported",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub title: String,
    pub status: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub video_path: Option<String>,
    pub duration: i64,
    pub documentation_md: Option<String>,
    pub steps_json: Option<String>,
    pub compressed_events_json: Option<String>,
    pub audio_path: Option<String>,
    pub audio_transcript: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preview_screenshot_path: Option<String>,
}

impl Session {
    pub fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            title: row.get(1)?,
            status: row.get(2)?,
            started_at: row.get(3)?,
            ended_at: row.get(4)?,
            video_path: row.get(5)?,
            duration: row.get(6)?,
            documentation_md: row.get(7)?,
            steps_json: row.get(8)?,
            compressed_events_json: row.get(9)?,
            audio_path: row.get(10)?,
            audio_transcript: row.get(11)?,
            preview_screenshot_path: None,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredEvent {
    pub id: String,
    pub session_id: String,
    pub event_type: String,
    pub app_name: Option<String>,
    pub payload: String,
    pub created_at: String,
    pub timestamp_ms: i64,
}

impl StoredEvent {
    pub fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            session_id: row.get(1)?,
            event_type: row.get(2)?,
            app_name: row.get(3)?,
            payload: row.get(4)?,
            created_at: row.get(5)?,
            timestamp_ms: row.get(6)?,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionEvent {
    pub event_type: String,
    pub app_name: Option<String>,
    pub payload: serde_json::Value,
    pub timestamp_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Screenshot {
    pub id: String,
    pub session_id: String,
    pub path: String,
    pub timestamp_ms: i64,
    pub trigger: Option<String>,
    pub selected: i64,
    pub click_x: Option<i64>,
    pub click_y: Option<i64>,
    pub annotations_json: Option<String>,
}

impl Screenshot {
    pub fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            session_id: row.get(1)?,
            path: row.get(2)?,
            timestamp_ms: row.get(3)?,
            trigger: row.get(4)?,
            selected: row.get(5)?,
            click_x: row.get(6)?,
            click_y: row.get(7)?,
            annotations_json: row.get(8)?,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportRecord {
    pub id: String,
    pub session_id: String,
    pub format: String,
    pub path: String,
    pub created_at: String,
}

impl ExportRecord {
    pub fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            session_id: row.get(1)?,
            format: row.get(2)?,
            path: row.get(3)?,
            created_at: row.get(4)?,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub id: String,
    pub name: String,
    pub provider_type: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub enabled: i64,
    pub created_at: String,
}

impl ProviderConfig {
    pub fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            name: row.get(1)?,
            provider_type: row.get(2)?,
            api_key: row.get(3)?,
            base_url: row.get(4)?,
            model: row.get(5)?,
            enabled: row.get(6)?,
            created_at: row.get(7)?,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AiJobStage {
    TimelineBuilder,
    ScreenshotSelector,
    TechnicalWriter,
    QualityReviewer,
}

impl AiJobStage {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::TimelineBuilder => "timeline_builder",
            Self::ScreenshotSelector => "screenshot_selector",
            Self::TechnicalWriter => "technical_writer",
            Self::QualityReviewer => "quality_reviewer",
        }
    }

    pub fn from_str(value: &str) -> Self {
        match value {
            "screenshot_selector" => Self::ScreenshotSelector,
            "technical_writer" => Self::TechnicalWriter,
            "quality_reviewer" => Self::QualityReviewer,
            _ => Self::TimelineBuilder,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AiJobStatus {
    Pending,
    Running,
    Completed,
    Failed,
}

impl AiJobStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Running => "running",
            Self::Completed => "completed",
            Self::Failed => "failed",
        }
    }

    pub fn from_str(value: &str) -> Self {
        match value {
            "running" => Self::Running,
            "completed" => Self::Completed,
            "failed" => Self::Failed,
            _ => Self::Pending,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiJob {
    pub id: String,
    pub session_id: String,
    pub stage: AiJobStage,
    pub status: AiJobStatus,
    pub input_json: Option<String>,
    pub output_json: Option<String>,
    pub error: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
}

impl AiJob {
    pub fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            session_id: row.get(1)?,
            stage: AiJobStage::from_str(row.get::<_, String>(2)?.as_str()),
            status: AiJobStatus::from_str(row.get::<_, String>(3)?.as_str()),
            input_json: row.get(4)?,
            output_json: row.get(5)?,
            error: row.get(6)?,
            created_at: row.get(7)?,
            completed_at: row.get(8)?,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowStep {
    pub step: usize,
    pub title: String,
    pub description: String,
    pub timestamp_ms: i64,
    pub screenshot_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Documentation {
    pub title: String,
    pub steps: Vec<WorkflowStep>,
    pub metadata: DocumentationMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentationMetadata {
    pub session_id: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedactionSummary {
    pub count: usize,
    pub patterns: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorInfo {
    pub id: String,
    pub name: String,
    pub is_primary: bool,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

