mod ai;
mod commands;
mod compression;
mod events;
mod export;
mod media;
mod platform;
mod recorder;
mod screenshots;
mod security;
mod state;
mod storage;
mod thread_util;

use std::sync::Arc;

use tauri::Manager;

use crate::platform::create_platform_services;
use crate::state::AppState;
#[cfg(target_os = "macos")]
use crate::platform::prepare_recording_permissions;
use crate::storage::Database;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|err| anyhow::anyhow!(err))?;
            let db = Arc::new(Database::new(app_data_dir)?);
            let platform = create_platform_services()?;
            let state = Arc::new(AppState::new(db, platform)?);
            state.cleanup_stale_recordings()?;
            app.manage(state);

            #[cfg(target_os = "macos")]
            {
                std::thread::spawn(|| {
                    let _ = prepare_recording_permissions();
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_recording_permissions,
            commands::prepare_recording_permissions,
            commands::request_accessibility_permission,
            commands::open_screen_recording_settings,
            commands::open_accessibility_settings,
            commands::reveal_executable_in_finder,
            commands::get_platform_name,
            commands::list_sessions,
            commands::get_session,
            commands::update_session_title,
            commands::update_session_documentation,
            commands::list_monitors,
            commands::start_recording,
            commands::stop_recording,
            commands::pause_recording,
            commands::resume_recording,
            commands::switch_recording_monitor,
            commands::capture_manual_screenshot,
            commands::list_events,
            commands::list_screenshots,
            commands::delete_screenshot,
            commands::list_providers,
            commands::update_provider,
            commands::generate_documentation,
            commands::cancel_documentation_generation,
            commands::list_ai_jobs,
            commands::export_session,
            commands::list_exports,
            commands::get_setting,
            commands::set_setting,
            commands::get_compressed_timeline,
            commands::get_replay_steps,
            commands::save_session_audio,
            commands::transcribe_session_audio,
            commands::delete_session,
            commands::export_session_bundle,
            commands::import_session_bundle,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let tauri::RunEvent::Ready = event {
                #[cfg(all(debug_assertions, target_os = "macos"))]
                platform::refresh_dev_dock_icon();
            }
        });
}
