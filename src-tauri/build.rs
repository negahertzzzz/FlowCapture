use std::path::{Path, PathBuf};
use std::process::Command;

fn main() {
    let ffmpeg_path = ensure_bundled_ffmpeg();
    if ffmpeg_path.is_file() {
        println!(
            "cargo:rustc-env=FLOWCAPTURE_FFMPEG={}",
            ffmpeg_path.display()
        );
    } else {
        println!("cargo:rustc-env=FLOWCAPTURE_FFMPEG=");
    }

    tauri_build::build();
}

fn ensure_bundled_ffmpeg() -> PathBuf {
    let target = std::env::var("TARGET").unwrap_or_default();
    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap_or_default());
    let binaries_dir = manifest_dir.join("binaries");
    let dest = binaries_dir.join(format!("ffmpeg-{target}"));

    if dest.is_file() {
        return dest;
    }

    let _ = std::fs::create_dir_all(&binaries_dir);
    match target.as_str() {
        "aarch64-apple-darwin" | "x86_64-apple-darwin" => download_macos_ffmpeg(&dest),
        "x86_64-unknown-linux-gnu" | "aarch64-unknown-linux-gnu" => {
            download_linux_ffmpeg(&dest)
        }
        "x86_64-pc-windows-msvc" => download_windows_ffmpeg(&dest),
        _ => {}
    }

    dest
}

fn download_macos_ffmpeg(dest: &Path) {
    let temp_dir = std::env::temp_dir().join(format!(
        "flowcapture-ffmpeg-{}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&temp_dir);
    if std::fs::create_dir_all(&temp_dir).is_err() {
        return;
    }

    let zip_path = temp_dir.join("ffmpeg.zip");
    if !run_command(
        Command::new("curl")
            .args([
                "-fsSL",
                "-o",
                zip_path.to_string_lossy().as_ref(),
                "https://evermeet.cx/ffmpeg/getrelease/zip",
            ])
            .status(),
    ) {
        return;
    }

    let _ = Command::new("unzip")
        .args([
            "-o",
            zip_path.to_string_lossy().as_ref(),
            "-d",
            temp_dir.to_string_lossy().as_ref(),
        ])
        .status();

    let binary = temp_dir.join("ffmpeg");
    if binary.is_file() {
        let _ = std::fs::copy(&binary, dest);
        let _ = Command::new("chmod")
            .args(["+x", dest.to_string_lossy().as_ref()])
            .status();
    }

    let _ = std::fs::remove_dir_all(&temp_dir);
}

fn download_linux_ffmpeg(dest: &Path) {
    let temp_dir = std::env::temp_dir().join(format!(
        "flowcapture-ffmpeg-{}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&temp_dir);
    if std::fs::create_dir_all(&temp_dir).is_err() {
        return;
    }

    let archive_path = temp_dir.join("ffmpeg.tar.xz");
    let url = match std::env::var("TARGET").unwrap_or_default().as_str() {
        "aarch64-unknown-linux-gnu" => {
            "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz"
        }
        _ => "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz",
    };

    if !run_command(
        Command::new("curl")
            .args(["-fsSL", "-o", archive_path.to_string_lossy().as_ref(), url])
            .status(),
    ) {
        return;
    }

    let _ = Command::new("tar")
        .args([
            "-xJf",
            archive_path.to_string_lossy().as_ref(),
            "-C",
            temp_dir.to_string_lossy().as_ref(),
        ])
        .status();

    if let Ok(entries) = std::fs::read_dir(&temp_dir) {
        for entry in entries.flatten() {
            let candidate = entry.path().join("ffmpeg");
            if candidate.is_file() {
                let _ = std::fs::copy(&candidate, dest);
                let _ = Command::new("chmod")
                    .args(["+x", dest.to_string_lossy().as_ref()])
                    .status();
                break;
            }
        }
    }

    let _ = std::fs::remove_dir_all(&temp_dir);
}

fn download_windows_ffmpeg(dest: &Path) {
    let temp_dir = std::env::temp_dir().join(format!(
        "flowcapture-ffmpeg-{}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&temp_dir);
    if std::fs::create_dir_all(&temp_dir).is_err() {
        return;
    }

    let archive_path = temp_dir.join("ffmpeg.zip");
    if !run_command(
        Command::new("curl")
            .args([
                "-fsSL",
                "-o",
                archive_path.to_string_lossy().as_ref(),
                "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip",
            ])
            .status(),
    ) {
        return;
    }

    let _ = Command::new("tar")
        .args([
            "-xf",
            archive_path.to_string_lossy().as_ref(),
            "-C",
            temp_dir.to_string_lossy().as_ref(),
        ])
        .status();

    if let Ok(entries) = walk_files(&temp_dir) {
        for path in entries {
            if path.file_name().is_some_and(|name| name == "ffmpeg.exe") {
                let _ = std::fs::copy(&path, dest);
                break;
            }
        }
    }

    let _ = std::fs::remove_dir_all(&temp_dir);
}

fn walk_files(root: &Path) -> std::io::Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else {
                files.push(path);
            }
        }
    }
    Ok(files)
}

fn run_command(status: std::io::Result<std::process::ExitStatus>) -> bool {
    matches!(status, Ok(status) if status.success())
}
