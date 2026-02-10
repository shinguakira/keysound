use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoundPack {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub description: String,

    /// "user" for user-created packs, None for bundled
    #[serde(default)]
    pub source: Option<String>,

    pub defaults: SoundDefaults,

    #[serde(default)]
    pub key_overrides: HashMap<String, KeySound>,

    #[serde(default)]
    pub category_overrides: HashMap<String, CategoryOverride>,

    /// Maps slot name -> original file name (for display in UI)
    #[serde(default)]
    pub original_names: HashMap<String, String>,

    /// Base directory of the sound pack (not serialized from JSON)
    #[serde(skip)]
    pub base_path: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoundDefaults {
    pub keydown: String,
    pub keyup: Option<String>,
    #[serde(default = "default_volume")]
    pub volume: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeySound {
    pub keydown: Option<String>,
    pub keyup: Option<String>,
    pub volume: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryOverride {
    pub keys: Vec<String>,
    pub keydown: Option<String>,
    pub keyup: Option<String>,
    pub volume: Option<f64>,
}

fn default_volume() -> f64 {
    1.0
}

/// Info returned to the frontend for pack selection
#[derive(Debug, Clone, Serialize)]
pub struct SoundPackInfo {
    pub id: String,
    pub name: String,
    pub author: String,
    pub description: String,
    /// "user" for user-created packs, None for bundled
    pub source: Option<String>,
}

impl SoundPack {
    /// Load a sound pack from a directory containing pack.json
    pub fn load(dir: &Path) -> Result<Self, String> {
        let manifest_path = dir.join("pack.json");
        if !manifest_path.exists() {
            return Err(format!("No pack.json found in {}", dir.display()));
        }

        let contents = std::fs::read_to_string(&manifest_path)
            .map_err(|e| format!("Failed to read {}: {}", manifest_path.display(), e))?;

        let mut pack: SoundPack = serde_json::from_str(&contents)
            .map_err(|e| format!("Failed to parse {}: {}", manifest_path.display(), e))?;

        pack.base_path = dir.to_path_buf();
        Ok(pack)
    }

    /// Get the absolute path to the sound file for a keydown event
    pub fn resolve_keydown(&self, key_name: &str) -> Option<PathBuf> {
        // 1. Check exact key override
        if let Some(key_sound) = self.key_overrides.get(key_name) {
            if let Some(ref path) = key_sound.keydown {
                return Some(self.base_path.join(path));
            }
        }

        // 2. Check category overrides
        for cat in self.category_overrides.values() {
            if cat.keys.iter().any(|k| k == key_name) {
                if let Some(ref path) = cat.keydown {
                    return Some(self.base_path.join(path));
                }
            }
        }

        // 3. Fall back to default
        Some(self.base_path.join(&self.defaults.keydown))
    }

    /// Get the volume for a specific key
    pub fn resolve_volume(&self, key_name: &str) -> f64 {
        // 1. Check exact key override
        if let Some(key_sound) = self.key_overrides.get(key_name) {
            if let Some(vol) = key_sound.volume {
                return vol;
            }
        }

        // 2. Check category overrides
        for cat in self.category_overrides.values() {
            if cat.keys.iter().any(|k| k == key_name) {
                if let Some(vol) = cat.volume {
                    return vol;
                }
            }
        }

        // 3. Fall back to default
        self.defaults.volume
    }

    pub fn info(&self) -> SoundPackInfo {
        SoundPackInfo {
            id: self.id.clone(),
            name: self.name.clone(),
            author: self.author.clone(),
            description: self.description.clone(),
            source: self.source.clone(),
        }
    }
}

/// Discover all sound packs in a directory
pub fn discover_packs(dir: &Path) -> Vec<SoundPack> {
    let mut packs = Vec::new();

    if !dir.exists() {
        return packs;
    }

    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                match SoundPack::load(&path) {
                    Ok(pack) => packs.push(pack),
                    Err(e) => {
                        log::warn!("Failed to load sound pack from {}: {}", path.display(), e);
                    }
                }
            }
        }
    }

    packs.sort_by(|a, b| {
        // "default" pack always comes first, then alphabetical by id
        match (a.id.as_str(), b.id.as_str()) {
            ("default", "default") => std::cmp::Ordering::Equal,
            ("default", _) => std::cmp::Ordering::Less,
            (_, "default") => std::cmp::Ordering::Greater,
            _ => a.id.cmp(&b.id),
        }
    });
    packs
}

/// Discover packs from both bundled and user directories.
/// Ordering: default first, then user/custom packs (alphabetical), then other bundled (alphabetical).
pub fn discover_all_packs(bundled_dir: &Path, user_dir: &Path) -> Vec<SoundPack> {
    let bundled = discover_packs(bundled_dir);
    let user = discover_packs(user_dir);

    let mut all = Vec::with_capacity(bundled.len() + user.len());

    // Default pack first (from bundled)
    for pack in &bundled {
        if pack.id == "default" {
            all.push(pack.clone());
        }
    }

    // Then user/custom packs (alphabetical, already sorted)
    all.extend(user);

    // Then other bundled packs (alphabetical, already sorted)
    for pack in &bundled {
        if pack.id != "default" {
            all.push(pack.clone());
        }
    }

    all
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn create_pack(dir: &Path, id: &str, source: Option<&str>) {
        let pack_dir = dir.join(id);
        fs::create_dir_all(pack_dir.join("sounds")).unwrap();
        // Write minimal silence wav
        fs::write(pack_dir.join("sounds").join("keydown.wav"), b"RIFF fake").unwrap();

        let mut manifest = serde_json::json!({
            "id": id,
            "name": id,
            "defaults": { "keydown": "sounds/keydown.wav" }
        });
        if let Some(s) = source {
            manifest["source"] = serde_json::json!(s);
        }
        fs::write(pack_dir.join("pack.json"), serde_json::to_string(&manifest).unwrap()).unwrap();
    }

    #[test]
    fn test_discover_packs_empty() {
        let dir = TempDir::new().unwrap();
        let packs = discover_packs(dir.path());
        assert!(packs.is_empty());
    }

    #[test]
    fn test_discover_packs_nonexistent_dir() {
        let packs = discover_packs(Path::new("/nonexistent/dir/xxx"));
        assert!(packs.is_empty());
    }

    #[test]
    fn test_discover_packs_default_first() {
        let dir = TempDir::new().unwrap();
        create_pack(dir.path(), "zzz", None);
        create_pack(dir.path(), "default", None);
        create_pack(dir.path(), "aaa", None);

        let packs = discover_packs(dir.path());
        assert_eq!(packs.len(), 3);
        assert_eq!(packs[0].id, "default");
    }

    #[test]
    fn test_discover_all_packs_ordering() {
        let bundled = TempDir::new().unwrap();
        let user = TempDir::new().unwrap();

        create_pack(bundled.path(), "default", None);
        create_pack(bundled.path(), "alpha", None);
        create_pack(bundled.path(), "beta", None);
        create_pack(user.path(), "custom-a", Some("user"));
        create_pack(user.path(), "custom-b", Some("user"));

        let all = discover_all_packs(bundled.path(), user.path());

        assert_eq!(all.len(), 5);
        // Order: default, custom-a, custom-b, alpha, beta
        assert_eq!(all[0].id, "default");
        assert_eq!(all[1].id, "custom-a");
        assert_eq!(all[2].id, "custom-b");
        assert_eq!(all[3].id, "alpha");
        assert_eq!(all[4].id, "beta");
    }

    #[test]
    fn test_discover_all_packs_no_user_packs() {
        let bundled = TempDir::new().unwrap();
        let user = TempDir::new().unwrap();

        create_pack(bundled.path(), "default", None);
        create_pack(bundled.path(), "piano", None);

        let all = discover_all_packs(bundled.path(), user.path());
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].id, "default");
        assert_eq!(all[1].id, "piano");
    }

    #[test]
    fn test_discover_all_packs_only_user_packs() {
        let bundled = TempDir::new().unwrap();
        let user = TempDir::new().unwrap();

        create_pack(user.path(), "my-pack", Some("user"));

        let all = discover_all_packs(bundled.path(), user.path());
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, "my-pack");
    }

    #[test]
    fn test_sound_pack_load_and_info() {
        let dir = TempDir::new().unwrap();
        create_pack(dir.path(), "test", Some("user"));

        let pack = SoundPack::load(&dir.path().join("test")).unwrap();
        assert_eq!(pack.id, "test");
        assert_eq!(pack.source, Some("user".into()));

        let info = pack.info();
        assert_eq!(info.id, "test");
        assert_eq!(info.source, Some("user".into()));
    }

    #[test]
    fn test_sound_pack_load_missing() {
        let dir = TempDir::new().unwrap();
        let result = SoundPack::load(&dir.path().join("nonexistent"));
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_keydown_default() {
        let dir = TempDir::new().unwrap();
        create_pack(dir.path(), "test", None);
        let pack = SoundPack::load(&dir.path().join("test")).unwrap();

        let path = pack.resolve_keydown("KeyA").unwrap();
        assert!(path.to_string_lossy().contains("keydown.wav"));
    }

    #[test]
    fn test_resolve_volume_default() {
        let dir = TempDir::new().unwrap();
        create_pack(dir.path(), "test", None);
        let pack = SoundPack::load(&dir.path().join("test")).unwrap();

        // default_volume() returns 1.0 (not specified in json, serde default)
        let vol = pack.resolve_volume("KeyA");
        assert!((vol - 1.0).abs() < f64::EPSILON);
    }
}
