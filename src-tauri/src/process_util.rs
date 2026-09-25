use std::ffi::OsStr;
use std::process::Command;

/// Builds a `Command` that never opens a console window. On Windows a GUI app that spawns a
/// console program (ffmpeg, headless Chrome, wkhtmltopdf) otherwise shows a cmd window for the
/// whole lifetime of the child process.
pub fn background_command(program: impl AsRef<OsStr>) -> Command {
    #[allow(unused_mut)]
    let mut command = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}
