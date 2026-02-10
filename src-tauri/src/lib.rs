mod custom_pack;
mod keyboard;
mod sound_engine;
mod sound_pack;

use custom_pack::{
    copy_dir_recursive, create_custom_pack_dir, delete_pack_dir, ensure_data_version,
    get_all_slots, import_sound_to_pack, remove_slot_from_pack, write_pack_json,
    SlotInfo,
};
use sound_engine::SoundEngine;
use sound_pack::{discover_all_packs, discover_packs, SoundPack, SoundPackInfo};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    AppHandle, Manager, State,
};

/// Shared application state
pub struct AppState {
    pub engine: Mutex<SoundEngine>,
    pub soundpacks_dir: PathBuf,
    pub user_soundpacks_dir: PathBuf,
    pub resource_dir: PathBuf,
}

// --- Tauri Commands ---

#[tauri::command]
async fn get_sound_packs(state: State<'_, AppState>) -> Result<Vec<SoundPackInfo>, String> {
    let packs = discover_all_packs(&state.soundpacks_dir, &state.user_soundpacks_dir);
    Ok(packs.iter().map(|p| p.info()).collect())
}

#[tauri::command]
async fn set_active_pack(pack_id: String, state: State<'_, AppState>) -> Result<(), String> {
    // Look in bundled packs first, then user packs
    let pack_dir = state.soundpacks_dir.join(&pack_id);
    let pack_dir = if pack_dir.join("pack.json").exists() {
        pack_dir
    } else {
        let user_dir = state.user_soundpacks_dir.join(&pack_id);
        if user_dir.join("pack.json").exists() {
            user_dir
        } else {
            return Err(format!("Sound pack '{}' not found", pack_id));
        }
    };

    let pack = SoundPack::load(&pack_dir)?;
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

#[tauri::command]
fn play_sound(key: String, state: State<AppState>) -> Result<(), String> {
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine.play_key(&key);
    Ok(())
}

// --- Custom Pack Commands ---

#[tauri::command]
async fn create_custom_pack(
    name: String,
    state: State<'_, AppState>,
) -> Result<SoundPackInfo, String> {
    let pack = create_custom_pack_dir(
        &state.user_soundpacks_dir,
        &state.resource_dir,
        &name,
    )?;
    Ok(pack.info())
}

#[tauri::command]
async fn import_sound_file(
    pack_id: String,
    slot: String,
    file_path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pack_dir = state.user_soundpacks_dir.join(&pack_id);
    let src = std::path::Path::new(&file_path);
    let pack = import_sound_to_pack(&pack_dir, &slot, src)?;

    // Reload if this is the active pack
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    if engine.active_pack_id().as_deref() == Some(&pack_id) {
        engine.load_pack(pack)?;
    }

    Ok(())
}

#[tauri::command]
async fn remove_sound_slot(
    pack_id: String,
    slot: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pack_dir = state.user_soundpacks_dir.join(&pack_id);
    let pack = remove_slot_from_pack(&pack_dir, &slot, &state.resource_dir)?;

    // Reload if active
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    if engine.active_pack_id().as_deref() == Some(&pack_id) {
        engine.load_pack(pack)?;
    }

    Ok(())
}

#[tauri::command]
async fn delete_custom_pack(
    pack_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pack_dir = state.user_soundpacks_dir.join(&pack_id);
    if !pack_dir.exists() {
        return Err("Custom pack not found".into());
    }

    // Refuse to delete bundled packs
    if state.soundpacks_dir.join(&pack_id).exists() {
        return Err("Cannot delete a bundled sound pack".into());
    }

    delete_pack_dir(&pack_dir)?;

    // If this was the active pack, switch to default
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    if engine.active_pack_id().as_deref() == Some(&pack_id) {
        let default_dir = state.soundpacks_dir.join("default");
        if default_dir.exists() {
            if let Ok(pack) = SoundPack::load(&default_dir) {
                engine.load_pack(pack).ok();
            }
        }
    }

    Ok(())
}

#[tauri::command]
async fn rename_custom_pack(
    pack_id: String,
    new_name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let new_name = new_name.trim().to_string();
    if new_name.is_empty() {
        return Err("Pack name cannot be empty".into());
    }

    let pack_dir = state.user_soundpacks_dir.join(&pack_id);
    if !pack_dir.join("pack.json").exists() {
        return Err("Custom pack not found".into());
    }

    let mut pack = SoundPack::load(&pack_dir)?;
    pack.name = new_name;
    write_pack_json(&pack)
}

#[tauri::command]
async fn get_custom_pack_slots(
    pack_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<SlotInfo>, String> {
    let pack_dir = state.user_soundpacks_dir.join(&pack_id);
    if !pack_dir.join("pack.json").exists() {
        return Err("Custom pack not found".into());
    }

    let pack = SoundPack::load(&pack_dir)?;
    Ok(get_all_slots(&pack))
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_sound_packs,
            set_active_pack,
            set_volume,
            get_volume,
            toggle_sound,
            get_enabled,
            get_active_pack_id,
            play_sound,
            create_custom_pack,
            import_sound_file,
            remove_sound_slot,
            delete_custom_pack,
            rename_custom_pack,
            get_custom_pack_slots,
        ])
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            let soundpacks_dir = app_data_dir.join("soundpacks");
            let user_soundpacks_dir = app_data_dir.join("user-soundpacks");

            // Create directories
            std::fs::create_dir_all(&soundpacks_dir).ok();
            std::fs::create_dir_all(&user_soundpacks_dir).ok();

            // Data versioning / migration
            ensure_data_version(&app_data_dir);

            // Sync bundled sound packs to app data dir on launch
            let resource_dir = app
                .path()
                .resource_dir()
                .expect("Failed to get resource dir");
            let bundled_packs = resource_dir.join("resources").join("soundpacks");

            if bundled_packs.exists() {
                copy_dir_recursive(&bundled_packs, &soundpacks_dir).ok();
            }

            // Initialize sound engine
            let mut engine = SoundEngine::new().expect("Failed to initialize audio engine");

            // Load the first available pack (default)
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
                soundpacks_dir,
                user_soundpacks_dir,
                resource_dir,
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
