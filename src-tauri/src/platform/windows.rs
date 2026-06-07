use anyhow::Result;

pub struct WindowsPlatform;

impl WindowsPlatform {
    pub fn new() -> Result<super::common::SharedPlatform> {
        super::common::SharedPlatform::new("Windows")
    }
}
