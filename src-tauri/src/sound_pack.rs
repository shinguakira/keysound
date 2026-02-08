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

    pub defaults: SoundDefaults,

    #[serde(default)]
    pub key_overrides: HashMap<String, KeySound>,

    #[serde(default)]
    pub category_overrides: HashMap<String, CategoryOverride>,

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
        for (_cat_name, cat) in &self.category_overrides {
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
        for (_cat_name, cat) in &self.category_overrides {
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
