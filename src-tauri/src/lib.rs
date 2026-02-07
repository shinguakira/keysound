mod keyboard;
mod sound_engine;
mod sound_pack;

use sound_engine::SoundEngine;
use sound_pack::{discover_packs, SoundPackInfo};
use std::sync::Mutex;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    AppHandle, Manager, State,
};

/// Shared application state
pub struct AppState {
    pub engine: Mutex<SoundEngine>,
    pub soundpacks_dir: std::path::PathBuf,
}

// --- Tauri Commands ---

#[tauri::command]
fn get_sound_packs(state: State<AppState>) -> Vec<SoundPackInfo> {
    let packs = discover_packs(&state.soundpacks_dir);
    packs.iter().map(|p| p.info()).collect()
}

#[tauri::command]
fn set_active_pack(pack_id: String, state: State<AppState>) -> Result<(), String> {
    let packs = discover_packs(&state.soundpacks_dir);
    let pack = packs
        .into_iter()
        .find(|p| p.id == pack_id)
        .ok_or_else(|| format!("Sound pack '{}' not found", pack_id))?;

    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine.load_pack(pack)
}

#[tauri::command]
fn set_volume(volume: f64, state: State<AppState>) -> Result<(), String> {
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine.set_volume(volume);
    Ok(())
}

#[tauri::command]
fn get_volume(state: State<AppState>) -> Result<f64, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    Ok(engine.get_volume())
}

#[tauri::command]
fn toggle_sound(state: State<AppState>) -> Result<bool, String> {
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    Ok(engine.toggle())
}

#[tauri::command]
fn get_enabled(state: State<AppState>) -> Result<bool, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    Ok(engine.is_enabled())
}

#[tauri::command]
fn get_active_pack_id(state: State<AppState>) -> Result<Option<String>, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    Ok(engine.active_pack_id())
}

// --- Tray Setup ---

fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let toggle = MenuItemBuilder::new("Toggle Sound")
        .id("toggle")
        .build(app)?;
    let show = MenuItemBuilder::new("Settings").id("show").build(app)?;
    let quit = MenuItemBuilder::new("Quit").id("quit").build(app)?;

    let menu = MenuBuilder::new(app)
        .items(&[&toggle, &show, &quit])
        .build()?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .tooltip("KeySound")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "toggle" => {
                if let Some(state) = app.try_state::<AppState>() {
                    if let Ok(mut engine) = state.engine.lock() {
                        let enabled = engine.toggle();
                        log::info!("Sound {}", if enabled { "enabled" } else { "disabled" });
                    }
                }
            }
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click { .. } = event {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

// --- App Entry ---

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Focus existing window when second instance is launched
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_sound_packs,
            set_active_pack,
            set_volume,
            get_volume,
            toggle_sound,
            get_enabled,
            get_active_pack_id,
        ])
        .setup(|app| {
            // Determine soundpacks directory
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            let soundpacks_dir = app_data_dir.join("soundpacks");

            // Copy bundled sound packs if the directory doesn't exist yet
            if !soundpacks_dir.exists() {
                std::fs::create_dir_all(&soundpacks_dir).ok();

                // Copy from bundled resources
                let resource_dir = app
                    .path()
                    .resource_dir()
                    .expect("Failed to get resource dir");
                let bundled_packs = resource_dir.join("resources").join("soundpacks");

                if bundled_packs.exists() {
                    copy_dir_recursive(&bundled_packs, &soundpacks_dir).ok();
                }
            }

            // Initialize sound engine
            let mut engine = SoundEngine::new().expect("Failed to initialize audio engine");

            // Try to load the first available pack
            let packs = discover_packs(&soundpacks_dir);
            if let Some(first_pack) = packs.into_iter().next() {
                log::info!("Loading default sound pack: {}", first_pack.name);
                if let Err(e) = engine.load_pack(first_pack) {
                    log::error!("Failed to load sound pack: {}", e);
                }
            } else {
                log::warn!("No sound packs found in {}", soundpacks_dir.display());
            }

            let state = AppState {
                engine: Mutex::new(engine),
                soundpacks_dir: soundpacks_dir.clone(),
            };
            app.manage(state);

            // Setup system tray
            setup_tray(app.handle())?;

            // Intercept window close -> hide instead of quit
            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_clone.hide();
                    }
                });
            }

            // Start keyboard listener and connect to sound engine
            let key_rx = keyboard::start_listener();
            let app_handle = app.handle().clone();

            std::thread::spawn(move || {
                while let Ok(key_name) = key_rx.recv() {
                    if let Some(state) = app_handle.try_state::<AppState>() {
                        if let Ok(mut engine) = state.engine.lock() {
                            engine.play_key(&key_name);
                        }
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Recursively copy a directory
fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> Result<(), std::io::Error> {
    if !dst.exists() {
        std::fs::create_dir_all(dst)?;
    }

    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)?;
        }
    }

    Ok(())
}
