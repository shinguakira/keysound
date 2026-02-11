use crate::sound_pack::{CategoryOverride, KeySound, SoundDefaults, SoundPack};
use std::path::Path;

pub const DATA_VERSION: u32 = 1;
pub const ALLOWED_EXTENSIONS: &[&str] = &["mp3", "wav", "ogg"];
pub const MAX_FILE_SIZE: u64 = 5 * 1024 * 1024; // 5MB

// --- Data Versioning ---

#[derive(serde::Serialize, serde::Deserialize)]
pub struct DataVersion {
    pub version: u32,
}

pub fn ensure_data_version(app_data_dir: &Path) {
    let version_file = app_data_dir.join("data-version.json");

    if !version_file.exists() {
        let version = DataVersion {
            version: DATA_VERSION,
        };
        if let Ok(json) = serde_json::to_string_pretty(&version) {
            std::fs::write(&version_file, json).ok();
        }
        return;
    }

    // Read current version and run migrations if needed
    if let Ok(contents) = std::fs::read_to_string(&version_file) {
        if let Ok(current) = serde_json::from_str::<DataVersion>(&contents) {
            if current.version < DATA_VERSION {
                // Run migrations here when needed in future versions
                // e.g., if current.version < 2 { migrate_v1_to_v2(app_data_dir); }
                let updated = DataVersion {
                    version: DATA_VERSION,
                };
                if let Ok(json) = serde_json::to_string_pretty(&updated) {
                    std::fs::write(&version_file, json).ok();
                }
            }
        }
    }
}

// --- Slot Helpers ---

#[derive(serde::Serialize)]
pub struct SlotInfo {
    pub slot: String,
    pub label: String,
    pub file_name: Option<String>,
}

pub fn get_all_slots(pack: &SoundPack) -> Vec<SlotInfo> {
    let slots = vec![
        ("default", "Default Key", Some(pack.defaults.keydown.clone())),
        (
            "space",
            "Space",
            pack.key_overrides
                .get("Space")
                .and_then(|k| k.keydown.clone()),
        ),
        (
            "enter",
            "Enter",
            pack.key_overrides
                .get("Return")
                .and_then(|k| k.keydown.clone()),
        ),
        (
            "modifier",
            "Modifiers",
            pack.category_overrides
                .get("modifiers")
                .and_then(|c| c.keydown.clone()),
        ),
        (
            "backspace",
            "Backspace / Delete",
            pack.category_overrides
                .get("delete")
                .and_then(|c| c.keydown.clone()),
        ),
    ];

    let mut result: Vec<SlotInfo> = slots
        .into_iter()
        .map(|(slot, label, path)| {
            // Use original_names if available, otherwise fall back to internal filename
            let file_name = pack
                .original_names
                .get(slot)
                .cloned()
                .or_else(|| {
                    path.as_ref().and_then(|p| {
                        Path::new(p)
                            .file_name()
                            .and_then(|f| f.to_str())
                            .map(|s| s.to_string())
                    })
                });
            // For default slot with silence placeholder, show as None
            let file_name = match (slot, file_name.as_deref()) {
                ("default", Some("keydown.wav")) if !pack.original_names.contains_key("default") => None,
                _ => file_name,
            };
            SlotInfo {
                slot: slot.to_string(),
                label: label.to_string(),
                file_name,
            }
        })
        .collect();

    // Append per-key overrides (skip Space/Return — already covered by category slots)
    let mut per_key: Vec<_> = pack
        .key_overrides
        .iter()
        .filter(|(key, _)| key.as_str() != "Space" && key.as_str() != "Return")
        .collect();
    per_key.sort_by_key(|(key, _)| (*key).clone());

    for (key_name, key_sound) in per_key {
        let slot_id = format!("key:{}", key_name);
        let file_name = pack
            .original_names
            .get(&slot_id)
            .cloned()
            .or_else(|| {
                key_sound.keydown.as_ref().and_then(|p| {
                    Path::new(p)
                        .file_name()
                        .and_then(|f| f.to_str())
                        .map(|s| s.to_string())
                })
            });
        result.push(SlotInfo {
            slot: slot_id,
            label: key_name.clone(),
            file_name,
        });
    }

    result
}

pub fn get_slot_path(pack: &SoundPack, slot: &str) -> Option<String> {
    match slot {
        "default" => Some(pack.defaults.keydown.clone()),
        "space" => pack
            .key_overrides
            .get("Space")
            .and_then(|k| k.keydown.clone()),
        "enter" => pack
            .key_overrides
            .get("Return")
            .and_then(|k| k.keydown.clone()),
        "modifier" => pack
            .category_overrides
            .get("modifiers")
            .and_then(|c| c.keydown.clone()),
        "backspace" => pack
            .category_overrides
            .get("delete")
            .and_then(|c| c.keydown.clone()),
        _ => {
            // Handle per-key slots: "key:KeyA" -> key_overrides["KeyA"]
            if let Some(key_name) = slot.strip_prefix("key:") {
                pack.key_overrides
                    .get(key_name)
                    .and_then(|k| k.keydown.clone())
            } else {
                None
            }
        }
    }
}

pub fn apply_slot_to_pack(pack: &mut SoundPack, slot: &str, path: Option<String>) {
    match slot {
        "default" => {
            if let Some(p) = path {
                pack.defaults.keydown = p;
            }
        }
        "space" => {
            if let Some(p) = path {
                pack.key_overrides
                    .entry("Space".into())
                    .or_insert_with(|| KeySound {
                        keydown: None,
                        keyup: None,
                        volume: Some(1.0),
                    })
                    .keydown = Some(p);
            } else {
                pack.key_overrides.remove("Space");
            }
        }
        "enter" => {
            if let Some(p) = path {
                pack.key_overrides
                    .entry("Return".into())
                    .or_insert_with(|| KeySound {
                        keydown: None,
                        keyup: None,
                        volume: Some(1.0),
                    })
                    .keydown = Some(p);
            } else {
                pack.key_overrides.remove("Return");
            }
        }
        "modifier" => {
            if let Some(p) = path {
                pack.category_overrides
                    .entry("modifiers".into())
                    .or_insert_with(|| CategoryOverride {
                        keys: vec![
                            "ShiftLeft".into(),
                            "ShiftRight".into(),
                            "ControlLeft".into(),
                            "ControlRight".into(),
                            "Alt".into(),
                            "AltGr".into(),
                            "MetaLeft".into(),
                            "MetaRight".into(),
                        ],
                        keydown: None,
                        keyup: None,
                        volume: Some(0.6),
                    })
                    .keydown = Some(p);
            } else {
                pack.category_overrides.remove("modifiers");
            }
        }
        "backspace" => {
            if let Some(p) = path {
                pack.category_overrides
                    .entry("delete".into())
                    .or_insert_with(|| CategoryOverride {
                        keys: vec!["Backspace".into(), "Delete".into()],
                        keydown: None,
                        keyup: None,
                        volume: None,
                    })
                    .keydown = Some(p);
            } else {
                pack.category_overrides.remove("delete");
            }
        }
        _ => {
            // Handle per-key slots: "key:KeyA" -> key_overrides["KeyA"]
            if let Some(key_name) = slot.strip_prefix("key:") {
                if let Some(p) = path {
                    pack.key_overrides
                        .entry(key_name.to_string())
                        .or_insert_with(|| KeySound {
                            keydown: None,
                            keyup: None,
                            volume: Some(1.0),
                        })
                        .keydown = Some(p);
                } else {
                    pack.key_overrides.remove(key_name);
                }
            }
        }
    }
}

pub fn write_pack_json(pack: &SoundPack) -> Result<(), String> {
    let json = serde_json::to_string_pretty(pack)
        .map_err(|e| format!("Failed to serialize pack: {}", e))?;
    let path = pack.base_path.join("pack.json");
    std::fs::write(&path, json).map_err(|e| format!("Failed to write pack.json: {}", e))
}

pub fn slugify(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

pub fn unique_id(base: &str, dir: &Path) -> String {
    if !dir.join(base).exists() {
        return base.to_string();
    }
    for i in 2..1000 {
        let candidate = format!("{}-{}", base, i);
        if !dir.join(&candidate).exists() {
            return candidate;
        }
    }
    format!(
        "{}-{}",
        base,
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    )
}

pub fn generate_silence_wav(path: &Path) -> Result<(), std::io::Error> {
    // Minimal WAV: 44-byte header + 882 bytes silence (10ms @ 44100Hz mono 16-bit)
    let sample_rate: u32 = 44100;
    let bits_per_sample: u16 = 16;
    let num_channels: u16 = 1;
    let num_samples: u32 = 441; // ~10ms
    let data_size = num_samples * u32::from(num_channels) * u32::from(bits_per_sample / 8);

    let mut buf = Vec::with_capacity(44 + data_size as usize);
    // RIFF header
    buf.extend_from_slice(b"RIFF");
    buf.extend_from_slice(&(36 + data_size).to_le_bytes());
    buf.extend_from_slice(b"WAVE");
    // fmt chunk
    buf.extend_from_slice(b"fmt ");
    buf.extend_from_slice(&16u32.to_le_bytes());
    buf.extend_from_slice(&1u16.to_le_bytes()); // PCM
    buf.extend_from_slice(&num_channels.to_le_bytes());
    buf.extend_from_slice(&sample_rate.to_le_bytes());
    let byte_rate = sample_rate * u32::from(num_channels) * u32::from(bits_per_sample / 8);
    buf.extend_from_slice(&byte_rate.to_le_bytes());
    let block_align = num_channels * (bits_per_sample / 8);
    buf.extend_from_slice(&block_align.to_le_bytes());
    buf.extend_from_slice(&bits_per_sample.to_le_bytes());
    // data chunk
    buf.extend_from_slice(b"data");
    buf.extend_from_slice(&data_size.to_le_bytes());
    buf.resize(44 + data_size as usize, 0); // silence

    std::fs::write(path, buf)
}

pub fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), std::io::Error> {
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

pub fn create_custom_pack_dir(
    user_soundpacks_dir: &Path,
    resource_dir: &Path,
    name: &str,
) -> Result<SoundPack, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Pack name cannot be empty".into());
    }

    let base_id = slugify(&name);
    let id = unique_id(&base_id, user_soundpacks_dir);

    let pack_dir = user_soundpacks_dir.join(&id);
    let sounds_dir = pack_dir.join("sounds");
    std::fs::create_dir_all(&sounds_dir)
        .map_err(|e| format!("Failed to create pack directory: {}", e))?;

    // Copy silence.wav as default keydown sound
    let silence_src = resource_dir.join("resources").join("silence.wav");
    let silence_dst = sounds_dir.join("keydown.wav");
    if silence_src.exists() {
        std::fs::copy(&silence_src, &silence_dst)
            .map_err(|e| format!("Failed to copy silence.wav: {}", e))?;
    } else {
        generate_silence_wav(&silence_dst)
            .map_err(|e| format!("Failed to generate silence: {}", e))?;
    }

    let pack = SoundPack {
        id,
        name,
        author: "User".into(),
        version: "1.0.0".into(),
        description: String::new(),
        source: Some("user".into()),
        defaults: SoundDefaults {
            keydown: "sounds/keydown.wav".into(),
            keyup: None,
            volume: 0.8,
        },
        key_overrides: Default::default(),
        category_overrides: Default::default(),
        original_names: Default::default(),
        base_path: pack_dir,
    };

    write_pack_json(&pack)?;
    Ok(pack)
}

pub fn import_sound_to_pack(
    pack_dir: &Path,
    slot: &str,
    src_path: &Path,
) -> Result<SoundPack, String> {
    if !pack_dir.join("pack.json").exists() {
        return Err("Custom pack not found".into());
    }

    if !src_path.exists() {
        return Err("File not found".into());
    }

    // Validate extension
    let ext = src_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    if !ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
        return Err(format!(
            "Unsupported format '{}'. Use mp3, wav, or ogg.",
            ext
        ));
    }

    // Validate file size
    let metadata = std::fs::metadata(src_path).map_err(|e| format!("Failed to read file: {}", e))?;
    if metadata.len() > MAX_FILE_SIZE {
        return Err(format!(
            "File too large ({:.1}MB). Maximum is 5MB.",
            metadata.len() as f64 / (1024.0 * 1024.0)
        ));
    }

    // Remove old sound file for this slot (avoids orphans when extension changes)
    let mut pack = SoundPack::load(pack_dir)?;
    if let Some(old_path) = get_slot_path(&pack, slot) {
        let abs_old = pack_dir.join(&old_path);
        if abs_old.exists() {
            std::fs::remove_file(&abs_old).ok();
        }
    }

    // Copy file to pack sounds directory
    // Sanitize slot name for filesystem (e.g. "key:KeyA" -> "key-KeyA")
    let safe_slot = slot.replace(':', "-");
    let dst_filename = format!("keydown-{}.{}", safe_slot, ext);
    let dst = pack_dir.join("sounds").join(&dst_filename);
    std::fs::copy(src_path, &dst).map_err(|e| format!("Failed to copy file: {}", e))?;
    let sound_path = format!("sounds/{}", dst_filename);
    apply_slot_to_pack(&mut pack, slot, Some(sound_path));

    // Store original file name for UI display
    let original_name = src_path
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or(&dst_filename)
        .to_string();
    pack.original_names.insert(slot.to_string(), original_name);

    write_pack_json(&pack)?;
    Ok(pack)
}

pub fn remove_slot_from_pack(
    pack_dir: &Path,
    slot: &str,
    resource_dir: &Path,
) -> Result<SoundPack, String> {
    if !pack_dir.join("pack.json").exists() {
        return Err("Custom pack not found".into());
    }

    let mut pack = SoundPack::load(pack_dir)?;

    // Find and delete the sound file for this slot
    let old_path = get_slot_path(&pack, slot);
    if let Some(ref path) = old_path {
        let abs_path = pack_dir.join(path);
        if abs_path.exists() {
            std::fs::remove_file(&abs_path).ok();
        }
    }

    if slot == "default" {
        // Reset default to silence.wav
        let silence_src = resource_dir.join("resources").join("silence.wav");
        let silence_dst = pack_dir.join("sounds").join("keydown.wav");
        if silence_src.exists() {
            std::fs::copy(&silence_src, &silence_dst).ok();
        } else {
            generate_silence_wav(&silence_dst).ok();
        }
        pack.defaults.keydown = "sounds/keydown.wav".into();
    } else {
        apply_slot_to_pack(&mut pack, slot, None);
    }

    pack.original_names.remove(slot);
    write_pack_json(&pack)?;
    Ok(pack)
}

pub fn delete_pack_dir(pack_dir: &Path) -> Result<(), String> {
    std::fs::remove_dir_all(pack_dir)
        .map_err(|e| format!("Failed to delete pack: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sound_pack::discover_all_packs;
    use std::fs;
    use tempfile::TempDir;

    fn create_test_pack_dir(dir: &Path, id: &str, source: Option<&str>) {
        let pack_dir = dir.join(id);
        let sounds_dir = pack_dir.join("sounds");
        fs::create_dir_all(&sounds_dir).unwrap();

        generate_silence_wav(&sounds_dir.join("keydown.wav")).unwrap();

        let mut manifest = serde_json::json!({
            "id": id,
            "name": id.to_uppercase(),
            "author": "Test",
            "version": "1.0.0",
            "description": "",
            "defaults": { "keydown": "sounds/keydown.wav", "volume": 0.8 }
        });
        if let Some(src) = source {
            manifest["source"] = serde_json::json!(src);
        }
        fs::write(
            pack_dir.join("pack.json"),
            serde_json::to_string_pretty(&manifest).unwrap(),
        )
        .unwrap();
    }

    // --- slugify ---

    #[test]
    fn test_slugify_basic() {
        assert_eq!(slugify("My Custom Pack"), "my-custom-pack");
    }

    #[test]
    fn test_slugify_special_chars() {
        assert_eq!(slugify("Hello! @World# 123"), "hello-world-123");
    }

    #[test]
    fn test_slugify_already_clean() {
        assert_eq!(slugify("clean"), "clean");
    }

    #[test]
    fn test_slugify_leading_trailing_spaces() {
        assert_eq!(slugify("  spaced  "), "spaced");
    }

    // --- unique_id ---

    #[test]
    fn test_unique_id_no_collision() {
        let dir = TempDir::new().unwrap();
        assert_eq!(unique_id("my-pack", dir.path()), "my-pack");
    }

    #[test]
    fn test_unique_id_with_collision() {
        let dir = TempDir::new().unwrap();
        fs::create_dir(dir.path().join("my-pack")).unwrap();
        assert_eq!(unique_id("my-pack", dir.path()), "my-pack-2");
    }

    #[test]
    fn test_unique_id_multiple_collisions() {
        let dir = TempDir::new().unwrap();
        fs::create_dir(dir.path().join("my-pack")).unwrap();
        fs::create_dir(dir.path().join("my-pack-2")).unwrap();
        fs::create_dir(dir.path().join("my-pack-3")).unwrap();
        assert_eq!(unique_id("my-pack", dir.path()), "my-pack-4");
    }

    // --- generate_silence_wav ---

    #[test]
    fn test_generate_silence_wav_creates_valid_wav() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("silence.wav");
        generate_silence_wav(&path).unwrap();

        assert!(path.exists());
        let data = fs::read(&path).unwrap();
        assert_eq!(&data[0..4], b"RIFF");
        assert_eq!(&data[8..12], b"WAVE");
        assert_eq!(&data[12..16], b"fmt ");
        // 44 byte header + 882 bytes data = 926 bytes
        assert_eq!(data.len(), 926);
    }

    // --- data versioning ---

    #[test]
    fn test_ensure_data_version_creates_file() {
        let dir = TempDir::new().unwrap();
        ensure_data_version(dir.path());

        let version_file = dir.path().join("data-version.json");
        assert!(version_file.exists());

        let contents = fs::read_to_string(&version_file).unwrap();
        let v: DataVersion = serde_json::from_str(&contents).unwrap();
        assert_eq!(v.version, DATA_VERSION);
    }

    #[test]
    fn test_ensure_data_version_idempotent() {
        let dir = TempDir::new().unwrap();
        ensure_data_version(dir.path());
        ensure_data_version(dir.path());

        let version_file = dir.path().join("data-version.json");
        let contents = fs::read_to_string(&version_file).unwrap();
        let v: DataVersion = serde_json::from_str(&contents).unwrap();
        assert_eq!(v.version, DATA_VERSION);
    }

    // --- write_pack_json / SoundPack round-trip ---

    #[test]
    fn test_write_and_load_pack_json() {
        let dir = TempDir::new().unwrap();
        let pack_dir = dir.path().join("test-pack");
        fs::create_dir_all(pack_dir.join("sounds")).unwrap();

        let pack = SoundPack {
            id: "test-pack".into(),
            name: "Test Pack".into(),
            author: "Tester".into(),
            version: "1.0.0".into(),
            description: "A test".into(),
            source: Some("user".into()),
            defaults: SoundDefaults {
                keydown: "sounds/keydown.wav".into(),
                keyup: None,
                volume: 0.8,
            },
            key_overrides: Default::default(),
            category_overrides: Default::default(),
            original_names: Default::default(),
            base_path: pack_dir.clone(),
        };

        write_pack_json(&pack).unwrap();
        assert!(pack_dir.join("pack.json").exists());

        let loaded = SoundPack::load(&pack_dir).unwrap();
        assert_eq!(loaded.id, "test-pack");
        assert_eq!(loaded.name, "Test Pack");
        assert_eq!(loaded.source, Some("user".into()));
    }

    // --- apply_slot_to_pack ---

    #[test]
    fn test_apply_slot_default() {
        let dir = TempDir::new().unwrap();
        create_test_pack_dir(dir.path(), "p", Some("user"));
        let mut pack = SoundPack::load(&dir.path().join("p")).unwrap();

        apply_slot_to_pack(&mut pack, "default", Some("sounds/new.mp3".into()));
        assert_eq!(pack.defaults.keydown, "sounds/new.mp3");
    }

    #[test]
    fn test_apply_slot_space() {
        let dir = TempDir::new().unwrap();
        create_test_pack_dir(dir.path(), "p", Some("user"));
        let mut pack = SoundPack::load(&dir.path().join("p")).unwrap();

        apply_slot_to_pack(&mut pack, "space", Some("sounds/space.mp3".into()));
        assert!(pack.key_overrides.contains_key("Space"));
        assert_eq!(
            pack.key_overrides["Space"].keydown.as_deref(),
            Some("sounds/space.mp3")
        );

        apply_slot_to_pack(&mut pack, "space", None);
        assert!(!pack.key_overrides.contains_key("Space"));
    }

    #[test]
    fn test_apply_slot_enter() {
        let dir = TempDir::new().unwrap();
        create_test_pack_dir(dir.path(), "p", Some("user"));
        let mut pack = SoundPack::load(&dir.path().join("p")).unwrap();

        apply_slot_to_pack(&mut pack, "enter", Some("sounds/enter.ogg".into()));
        assert_eq!(
            pack.key_overrides["Return"].keydown.as_deref(),
            Some("sounds/enter.ogg")
        );
    }

    #[test]
    fn test_apply_slot_modifier() {
        let dir = TempDir::new().unwrap();
        create_test_pack_dir(dir.path(), "p", Some("user"));
        let mut pack = SoundPack::load(&dir.path().join("p")).unwrap();

        apply_slot_to_pack(&mut pack, "modifier", Some("sounds/mod.wav".into()));
        let cat = &pack.category_overrides["modifiers"];
        assert_eq!(cat.keydown.as_deref(), Some("sounds/mod.wav"));
        assert!(cat.keys.contains(&"ShiftLeft".to_string()));

        apply_slot_to_pack(&mut pack, "modifier", None);
        assert!(!pack.category_overrides.contains_key("modifiers"));
    }

    #[test]
    fn test_apply_slot_backspace() {
        let dir = TempDir::new().unwrap();
        create_test_pack_dir(dir.path(), "p", Some("user"));
        let mut pack = SoundPack::load(&dir.path().join("p")).unwrap();

        apply_slot_to_pack(&mut pack, "backspace", Some("sounds/bs.mp3".into()));
        let cat = &pack.category_overrides["delete"];
        assert_eq!(cat.keydown.as_deref(), Some("sounds/bs.mp3"));
        assert!(cat.keys.contains(&"Backspace".to_string()));
    }

    // --- get_slot_path ---

    #[test]
    fn test_get_slot_path_default() {
        let dir = TempDir::new().unwrap();
        create_test_pack_dir(dir.path(), "p", Some("user"));
        let pack = SoundPack::load(&dir.path().join("p")).unwrap();

        assert_eq!(
            get_slot_path(&pack, "default"),
            Some("sounds/keydown.wav".into())
        );
    }

    #[test]
    fn test_get_slot_path_empty_slot() {
        let dir = TempDir::new().unwrap();
        create_test_pack_dir(dir.path(), "p", Some("user"));
        let pack = SoundPack::load(&dir.path().join("p")).unwrap();

        assert_eq!(get_slot_path(&pack, "space"), None);
    }

    // --- get_all_slots ---

    #[test]
    fn test_get_all_slots_fresh_pack() {
        let dir = TempDir::new().unwrap();
        create_test_pack_dir(dir.path(), "p", Some("user"));
        let pack = SoundPack::load(&dir.path().join("p")).unwrap();

        let slots = get_all_slots(&pack);
        assert_eq!(slots.len(), 5);
        assert_eq!(slots[0].slot, "default");
        // Default slot with no original_names entry shows as None (silence placeholder)
        assert!(slots[0].file_name.is_none());
        assert_eq!(slots[1].slot, "space");
        assert!(slots[1].file_name.is_none());
    }

    #[test]
    fn test_get_all_slots_with_original_name() {
        let dir = TempDir::new().unwrap();
        create_test_pack_dir(dir.path(), "p", Some("user"));
        let mut pack = SoundPack::load(&dir.path().join("p")).unwrap();

        pack.original_names
            .insert("default".into(), "my-cool-sound.mp3".into());
        pack.original_names
            .insert("space".into(), "spacebar.wav".into());
        apply_slot_to_pack(&mut pack, "space", Some("sounds/keydown-space.wav".into()));

        let slots = get_all_slots(&pack);
        assert_eq!(slots[0].file_name.as_deref(), Some("my-cool-sound.mp3"));
        assert_eq!(slots[1].file_name.as_deref(), Some("spacebar.wav"));
    }

    // --- copy_dir_recursive ---

    #[test]
    fn test_copy_dir_recursive() {
        let src = TempDir::new().unwrap();
        let dst = TempDir::new().unwrap();

        fs::write(src.path().join("a.txt"), "hello").unwrap();
        fs::create_dir(src.path().join("sub")).unwrap();
        fs::write(src.path().join("sub").join("b.txt"), "world").unwrap();

        let dst_dir = dst.path().join("out");
        copy_dir_recursive(src.path(), &dst_dir).unwrap();

        assert_eq!(fs::read_to_string(dst_dir.join("a.txt")).unwrap(), "hello");
        assert_eq!(
            fs::read_to_string(dst_dir.join("sub").join("b.txt")).unwrap(),
            "world"
        );
    }

    // --- discover_all_packs ordering ---

    #[test]
    fn test_discover_all_packs_custom_before_bundled() {
        let bundled = TempDir::new().unwrap();
        let user = TempDir::new().unwrap();

        create_test_pack_dir(bundled.path(), "default", None);
        create_test_pack_dir(bundled.path(), "alpha", None);
        create_test_pack_dir(bundled.path(), "beta", None);
        create_test_pack_dir(user.path(), "custom-a", Some("user"));
        create_test_pack_dir(user.path(), "custom-b", Some("user"));

        let all = discover_all_packs(bundled.path(), user.path());

        assert_eq!(all.len(), 5);
        // Order: default, custom-a, custom-b, alpha, beta
        assert_eq!(all[0].id, "default");
        assert_eq!(all[1].id, "custom-a");
        assert_eq!(all[2].id, "custom-b");
        assert_eq!(all[3].id, "alpha");
        assert_eq!(all[4].id, "beta");
    }

    // --- Full lifecycle: create, import, remove slot, delete ---

    #[test]
    fn test_create_custom_pack() {
        let dir = TempDir::new().unwrap();
        let user_dir = dir.path().join("user-soundpacks");
        fs::create_dir_all(&user_dir).unwrap();

        // resource_dir won't have silence.wav, so it falls back to generation
        let resource_dir = dir.path().join("res");
        fs::create_dir_all(&resource_dir).unwrap();

        let pack = create_custom_pack_dir(&user_dir, &resource_dir, "My Sound").unwrap();
        assert_eq!(pack.id, "my-sound");
        assert_eq!(pack.name, "My Sound");
        assert_eq!(pack.source, Some("user".into()));
        assert!(pack.base_path.join("pack.json").exists());
        assert!(pack.base_path.join("sounds").join("keydown.wav").exists());
    }

    #[test]
    fn test_create_custom_pack_collision() {
        let dir = TempDir::new().unwrap();
        let user_dir = dir.path().join("user-soundpacks");
        fs::create_dir_all(&user_dir).unwrap();
        let resource_dir = dir.path().join("res");
        fs::create_dir_all(&resource_dir).unwrap();

        let p1 = create_custom_pack_dir(&user_dir, &resource_dir, "Same Name").unwrap();
        let p2 = create_custom_pack_dir(&user_dir, &resource_dir, "Same Name").unwrap();
        assert_eq!(p1.id, "same-name");
        assert_eq!(p2.id, "same-name-2");
    }

    #[test]
    fn test_create_custom_pack_empty_name() {
        let dir = TempDir::new().unwrap();
        let user_dir = dir.path().join("user-soundpacks");
        fs::create_dir_all(&user_dir).unwrap();
        let resource_dir = dir.path().join("res");

        let result = create_custom_pack_dir(&user_dir, &resource_dir, "  ");
        assert!(result.is_err());
    }

    #[test]
    fn test_import_sound_file() {
        let dir = TempDir::new().unwrap();
        let user_dir = dir.path().join("user-soundpacks");
        fs::create_dir_all(&user_dir).unwrap();
        let resource_dir = dir.path().join("res");
        fs::create_dir_all(&resource_dir).unwrap();

        let pack = create_custom_pack_dir(&user_dir, &resource_dir, "Test").unwrap();

        // Create a fake mp3 file
        let fake_audio = dir.path().join("my-space-sound.mp3");
        fs::write(&fake_audio, b"fake mp3 data").unwrap();

        let pack = import_sound_to_pack(&pack.base_path, "space", &fake_audio).unwrap();
        assert!(pack.key_overrides.contains_key("Space"));
        assert_eq!(
            pack.original_names.get("space").map(|s| s.as_str()),
            Some("my-space-sound.mp3")
        );
        assert!(pack.base_path.join("sounds").join("keydown-space.mp3").exists());
    }

    #[test]
    fn test_import_rejects_unsupported_format() {
        let dir = TempDir::new().unwrap();
        let user_dir = dir.path().join("user-soundpacks");
        fs::create_dir_all(&user_dir).unwrap();
        let resource_dir = dir.path().join("res");
        fs::create_dir_all(&resource_dir).unwrap();

        let pack = create_custom_pack_dir(&user_dir, &resource_dir, "Test").unwrap();

        let bad_file = dir.path().join("sound.txt");
        fs::write(&bad_file, b"not audio").unwrap();

        let result = import_sound_to_pack(&pack.base_path, "space", &bad_file);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unsupported format"));
    }

    #[test]
    fn test_import_replaces_old_file_different_extension() {
        let dir = TempDir::new().unwrap();
        let user_dir = dir.path().join("user-soundpacks");
        fs::create_dir_all(&user_dir).unwrap();
        let resource_dir = dir.path().join("res");
        fs::create_dir_all(&resource_dir).unwrap();

        let pack = create_custom_pack_dir(&user_dir, &resource_dir, "Test").unwrap();

        // Import a .wav file for space
        let wav_file = dir.path().join("space.wav");
        fs::write(&wav_file, b"wav data").unwrap();
        import_sound_to_pack(&pack.base_path, "space", &wav_file).unwrap();
        assert!(pack.base_path.join("sounds").join("keydown-space.wav").exists());

        // Import a .mp3 file for the same slot — old .wav should be deleted
        let mp3_file = dir.path().join("space.mp3");
        fs::write(&mp3_file, b"mp3 data").unwrap();
        import_sound_to_pack(&pack.base_path, "space", &mp3_file).unwrap();

        assert!(!pack.base_path.join("sounds").join("keydown-space.wav").exists());
        assert!(pack.base_path.join("sounds").join("keydown-space.mp3").exists());
    }

    #[test]
    fn test_remove_slot() {
        let dir = TempDir::new().unwrap();
        let user_dir = dir.path().join("user-soundpacks");
        fs::create_dir_all(&user_dir).unwrap();
        let resource_dir = dir.path().join("res");
        fs::create_dir_all(&resource_dir).unwrap();

        let pack = create_custom_pack_dir(&user_dir, &resource_dir, "Test").unwrap();

        // Import space sound
        let audio = dir.path().join("space.mp3");
        fs::write(&audio, b"fake mp3").unwrap();
        import_sound_to_pack(&pack.base_path, "space", &audio).unwrap();

        // Remove it
        let pack = remove_slot_from_pack(&pack.base_path, "space", &resource_dir).unwrap();
        assert!(!pack.key_overrides.contains_key("Space"));
        assert!(!pack.original_names.contains_key("space"));
        assert!(!pack.base_path.join("sounds").join("keydown-space.mp3").exists());
    }

    #[test]
    fn test_remove_default_slot_resets_to_silence() {
        let dir = TempDir::new().unwrap();
        let user_dir = dir.path().join("user-soundpacks");
        fs::create_dir_all(&user_dir).unwrap();
        let resource_dir = dir.path().join("res");
        fs::create_dir_all(&resource_dir).unwrap();

        let pack = create_custom_pack_dir(&user_dir, &resource_dir, "Test").unwrap();

        // Import a custom default sound
        let audio = dir.path().join("keydown.mp3");
        fs::write(&audio, b"fake mp3").unwrap();
        import_sound_to_pack(&pack.base_path, "default", &audio).unwrap();

        // Remove default — should reset to silence
        let pack = remove_slot_from_pack(&pack.base_path, "default", &resource_dir).unwrap();
        assert_eq!(pack.defaults.keydown, "sounds/keydown.wav");
        assert!(!pack.original_names.contains_key("default"));
        // silence.wav should exist as keydown.wav
        assert!(pack.base_path.join("sounds").join("keydown.wav").exists());
    }

    #[test]
    fn test_delete_pack_removes_all_files() {
        let dir = TempDir::new().unwrap();
        let user_dir = dir.path().join("user-soundpacks");
        fs::create_dir_all(&user_dir).unwrap();
        let resource_dir = dir.path().join("res");
        fs::create_dir_all(&resource_dir).unwrap();

        let pack = create_custom_pack_dir(&user_dir, &resource_dir, "Test").unwrap();

        // Import files
        let audio1 = dir.path().join("a.mp3");
        let audio2 = dir.path().join("b.wav");
        fs::write(&audio1, b"fake").unwrap();
        fs::write(&audio2, b"fake").unwrap();
        import_sound_to_pack(&pack.base_path, "space", &audio1).unwrap();
        import_sound_to_pack(&pack.base_path, "enter", &audio2).unwrap();

        let pack_dir = pack.base_path.clone();
        delete_pack_dir(&pack_dir).unwrap();
        assert!(!pack_dir.exists());
    }

    // --- Full lifecycle ---

    #[test]
    fn test_full_lifecycle() {
        let dir = TempDir::new().unwrap();
        let user_dir = dir.path().join("user-soundpacks");
        let bundled_dir = dir.path().join("soundpacks");
        fs::create_dir_all(&user_dir).unwrap();
        fs::create_dir_all(&bundled_dir).unwrap();
        let resource_dir = dir.path().join("res");
        fs::create_dir_all(&resource_dir).unwrap();

        // Create a bundled pack
        create_test_pack_dir(bundled_dir.as_path(), "default", None);

        // Data versioning
        ensure_data_version(dir.path());
        assert!(dir.path().join("data-version.json").exists());

        // Create custom pack
        let pack = create_custom_pack_dir(&user_dir, &resource_dir, "My Sounds").unwrap();
        assert_eq!(pack.id, "my-sounds");

        // Import audio files
        let audio_default = dir.path().join("click.mp3");
        let audio_space = dir.path().join("spacebar.wav");
        fs::write(&audio_default, b"click data").unwrap();
        fs::write(&audio_space, b"space data").unwrap();

        import_sound_to_pack(&pack.base_path, "default", &audio_default).unwrap();
        import_sound_to_pack(&pack.base_path, "space", &audio_space).unwrap();

        // Verify discover_all_packs ordering: default, custom, bundled-others
        let all = discover_all_packs(&bundled_dir, &user_dir);
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].id, "default");
        assert_eq!(all[1].id, "my-sounds");

        // Verify slots
        let pack = SoundPack::load(&pack.base_path).unwrap();
        let slots = get_all_slots(&pack);
        assert_eq!(slots[0].file_name.as_deref(), Some("click.mp3"));
        assert_eq!(slots[1].file_name.as_deref(), Some("spacebar.wav"));

        // Remove space slot
        let pack = remove_slot_from_pack(&pack.base_path, "space", &resource_dir).unwrap();
        let slots = get_all_slots(&pack);
        assert!(slots[1].file_name.is_none());

        // Delete custom pack
        delete_pack_dir(&pack.base_path).unwrap();
        let all = discover_all_packs(&bundled_dir, &user_dir);
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, "default");
    }

    // --- Per-key sound slots ---

    #[test]
    fn test_apply_slot_per_key() {
        let dir = TempDir::new().unwrap();
        create_test_pack_dir(dir.path(), "p", Some("user"));
        let mut pack = SoundPack::load(&dir.path().join("p")).unwrap();

        apply_slot_to_pack(&mut pack, "key:KeyA", Some("sounds/a.mp3".into()));
        assert!(pack.key_overrides.contains_key("KeyA"));
        assert_eq!(
            pack.key_overrides["KeyA"].keydown.as_deref(),
            Some("sounds/a.mp3")
        );

        apply_slot_to_pack(&mut pack, "key:KeyA", None);
        assert!(!pack.key_overrides.contains_key("KeyA"));
    }

    #[test]
    fn test_get_slot_path_per_key() {
        let dir = TempDir::new().unwrap();
        create_test_pack_dir(dir.path(), "p", Some("user"));
        let mut pack = SoundPack::load(&dir.path().join("p")).unwrap();

        pack.key_overrides.insert(
            "KeyB".into(),
            KeySound {
                keydown: Some("sounds/b.wav".into()),
                keyup: None,
                volume: Some(1.0),
            },
        );

        assert_eq!(
            get_slot_path(&pack, "key:KeyB"),
            Some("sounds/b.wav".into())
        );
        assert_eq!(get_slot_path(&pack, "key:KeyZ"), None);
    }

    #[test]
    fn test_get_all_slots_with_per_key() {
        let dir = TempDir::new().unwrap();
        create_test_pack_dir(dir.path(), "p", Some("user"));
        let mut pack = SoundPack::load(&dir.path().join("p")).unwrap();

        pack.key_overrides.insert(
            "KeyA".into(),
            KeySound {
                keydown: Some("sounds/a.mp3".into()),
                keyup: None,
                volume: Some(1.0),
            },
        );
        pack.original_names
            .insert("key:KeyA".into(), "a-sound.mp3".into());

        let slots = get_all_slots(&pack);
        assert_eq!(slots.len(), 6); // 5 category + 1 per-key
        let key_slot = slots.iter().find(|s| s.slot == "key:KeyA").unwrap();
        assert_eq!(key_slot.label, "KeyA");
        assert_eq!(key_slot.file_name.as_deref(), Some("a-sound.mp3"));
    }

    #[test]
    fn test_get_all_slots_per_key_skips_space_return() {
        let dir = TempDir::new().unwrap();
        create_test_pack_dir(dir.path(), "p", Some("user"));
        let mut pack = SoundPack::load(&dir.path().join("p")).unwrap();

        // Add Space and Return as key_overrides (these are category slots)
        apply_slot_to_pack(&mut pack, "space", Some("sounds/space.mp3".into()));
        apply_slot_to_pack(&mut pack, "enter", Some("sounds/enter.mp3".into()));
        // Add a real per-key override
        apply_slot_to_pack(&mut pack, "key:KeyC", Some("sounds/c.mp3".into()));

        let slots = get_all_slots(&pack);
        // Should have 5 category + 1 per-key (Space/Return not duplicated)
        assert_eq!(slots.len(), 6);
        assert!(slots.iter().any(|s| s.slot == "key:KeyC"));
        assert!(!slots.iter().any(|s| s.slot == "key:Space"));
        assert!(!slots.iter().any(|s| s.slot == "key:Return"));
    }

    #[test]
    fn test_import_per_key_sound() {
        let dir = TempDir::new().unwrap();
        let user_dir = dir.path().join("user-soundpacks");
        fs::create_dir_all(&user_dir).unwrap();
        let resource_dir = dir.path().join("res");
        fs::create_dir_all(&resource_dir).unwrap();

        let pack = create_custom_pack_dir(&user_dir, &resource_dir, "Test").unwrap();

        let audio = dir.path().join("a-key.mp3");
        fs::write(&audio, b"fake mp3").unwrap();

        let pack = import_sound_to_pack(&pack.base_path, "key:KeyA", &audio).unwrap();

        assert!(pack.key_overrides.contains_key("KeyA"));
        assert_eq!(
            pack.original_names.get("key:KeyA").map(|s| s.as_str()),
            Some("a-key.mp3")
        );
        // Filename uses sanitized slot: "key:KeyA" -> "key-KeyA"
        assert!(pack
            .base_path
            .join("sounds")
            .join("keydown-key-KeyA.mp3")
            .exists());
    }

    #[test]
    fn test_remove_per_key_slot() {
        let dir = TempDir::new().unwrap();
        let user_dir = dir.path().join("user-soundpacks");
        fs::create_dir_all(&user_dir).unwrap();
        let resource_dir = dir.path().join("res");
        fs::create_dir_all(&resource_dir).unwrap();

        let pack = create_custom_pack_dir(&user_dir, &resource_dir, "Test").unwrap();

        let audio = dir.path().join("b.wav");
        fs::write(&audio, b"fake wav").unwrap();
        import_sound_to_pack(&pack.base_path, "key:KeyB", &audio).unwrap();

        let pack = remove_slot_from_pack(&pack.base_path, "key:KeyB", &resource_dir).unwrap();
        assert!(!pack.key_overrides.contains_key("KeyB"));
        assert!(!pack.original_names.contains_key("key:KeyB"));
    }

    #[test]
    fn test_per_key_multiple_keys() {
        let dir = TempDir::new().unwrap();
        let user_dir = dir.path().join("user-soundpacks");
        fs::create_dir_all(&user_dir).unwrap();
        let resource_dir = dir.path().join("res");
        fs::create_dir_all(&resource_dir).unwrap();

        let pack = create_custom_pack_dir(&user_dir, &resource_dir, "Multi").unwrap();

        let audio_a = dir.path().join("a.mp3");
        let audio_b = dir.path().join("b.wav");
        let audio_c = dir.path().join("c.ogg");
        fs::write(&audio_a, b"fake").unwrap();
        fs::write(&audio_b, b"fake").unwrap();
        fs::write(&audio_c, b"fake").unwrap();

        import_sound_to_pack(&pack.base_path, "key:KeyA", &audio_a).unwrap();
        import_sound_to_pack(&pack.base_path, "key:KeyB", &audio_b).unwrap();
        import_sound_to_pack(&pack.base_path, "key:Digit0", &audio_c).unwrap();

        let pack = SoundPack::load(&pack.base_path).unwrap();
        let slots = get_all_slots(&pack);
        // 5 category + 3 per-key = 8
        assert_eq!(slots.len(), 8);

        // Per-key slots should be sorted alphabetically
        let per_key: Vec<_> = slots.iter().filter(|s| s.slot.starts_with("key:")).collect();
        assert_eq!(per_key[0].slot, "key:Digit0");
        assert_eq!(per_key[1].slot, "key:KeyA");
        assert_eq!(per_key[2].slot, "key:KeyB");
    }
}
