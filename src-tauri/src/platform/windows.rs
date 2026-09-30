use anyhow::Result;

pub struct WindowsPlatform;

impl WindowsPlatform {
    #[allow(clippy::new_ret_no_self)]
    pub fn new() -> Result<super::common::SharedPlatform> {
        super::common::SharedPlatform::new("Windows")
    }
}
