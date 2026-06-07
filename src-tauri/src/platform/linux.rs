use anyhow::Result;

pub struct LinuxPlatform;

impl LinuxPlatform {
    pub fn new() -> Result<super::common::SharedPlatform> {
        super::common::SharedPlatform::new("Linux")
    }
}
