use std::path::PathBuf;

use anyhow::Result;

use crate::platform::PlatformServices;

pub struct RecorderEngine {
    output_dir: Option<PathBuf>,
}

impl RecorderEngine {
    pub fn new() -> Self {
        Self { output_dir: None }
    }

    pub fn start_with_platform(
        &mut self,
        session_dir: PathBuf,
        platform: &mut PlatformServices,
    ) -> Result<()> {
        let video_dir = session_dir.join("video");
        platform.recorder.start(video_dir)?;
        self.output_dir = Some(session_dir);
        Ok(())
    }

    pub fn stop_with_platform(
        &mut self,
        platform: &mut PlatformServices,
    ) -> Result<Option<String>> {
        let video_path = platform.recorder.stop()?;
        self.output_dir.take();
        Ok(video_path.map(|path| path.to_string_lossy().to_string()))
    }
}
