use kira::{
    sound::static_sound::StaticSoundData, AudioManager, AudioManagerSettings, Decibels,
    DefaultBackend,
};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::sound_pack::SoundPack;

/// Convert a linear amplitude (0.0-1.0) to decibels
fn amplitude_to_db(amplitude: f64) -> f64 {
    if amplitude <= 0.0 {
        -100.0
    } else {
        20.0 * amplitude.log10()
    }
}

pub struct SoundEngine {
    manager: AudioManager,
    /// Pre-loaded sounds: file path -> sound data
    sounds: HashMap<PathBuf, StaticSoundData>,
    /// Currently active sound pack
    active_pack: Option<SoundPack>,
    /// Master volume (0.0 - 1.0)
    volume: f64,
    /// Whether sound is enabled
    enabled: bool,
}

impl SoundEngine {
    pub fn new() -> Result<Self, String> {
        let manager = AudioManager::<DefaultBackend>::new(AudioManagerSettings::default())
            .map_err(|e| format!("Failed to create audio manager: {}", e))?;

        Ok(Self {
            manager,
            sounds: HashMap::new(),
            active_pack: None,
            volume: 1.0,
            enabled: true,
        })
    }

    /// Load a sound pack and pre-load all its sound files
    pub fn load_pack(&mut self, pack: SoundPack) -> Result<(), String> {
        self.sounds.clear();

        // Collect all unique sound file paths from the pack
        let mut paths_to_load: Vec<PathBuf> = Vec::new();

        // Default sounds
        paths_to_load.push(pack.base_path.join(&pack.defaults.keydown));
        if let Some(ref keyup) = pack.defaults.keyup {
            paths_to_load.push(pack.base_path.join(keyup));
        }

        // Key overrides
        for key_sound in pack.key_overrides.values() {
            if let Some(ref path) = key_sound.keydown {
                paths_to_load.push(pack.base_path.join(path));
            }
            if let Some(ref path) = key_sound.keyup {
                paths_to_load.push(pack.base_path.join(path));
            }
        }

        // Category overrides
        for cat in pack.category_overrides.values() {
            if let Some(ref path) = cat.keydown {
                paths_to_load.push(pack.base_path.join(path));
            }
            if let Some(ref path) = cat.keyup {
                paths_to_load.push(pack.base_path.join(path));
            }
        }

        // Deduplicate
        paths_to_load.sort();
        paths_to_load.dedup();

        // Pre-load all sounds in parallel (disk I/O + audio decode)
        let paths_to_load: Vec<PathBuf> = paths_to_load
            .into_iter()
            .filter(|p| {
                if !p.exists() {
                    log::warn!("Sound file not found: {}", p.display());
                    false
                } else {
                    true
                }
            })
            .collect();

        let results: Vec<_> = std::thread::scope(|s| {
            let handles: Vec<_> = paths_to_load
                .iter()
                .map(|path| {
                    let path = path.clone();
                    s.spawn(move || {
                        let result = StaticSoundData::from_file(&path);
                        (path, result)
                    })
                })
                .collect();
            handles.into_iter().map(|h| h.join().unwrap()).collect()
        });

        for (path, result) in results {
            match result {
                Ok(data) => {
                    self.sounds.insert(path, data);
                }
                Err(e) => {
                    log::warn!("Failed to load sound {}: {}", path.display(), e);
                }
            }
        }

        log::info!(
            "Loaded sound pack '{}' with {} sounds",
            pack.name,
            self.sounds.len()
        );
        self.active_pack = Some(pack);
        Ok(())
    }

    /// Play the sound for a keypress
    pub fn play_key(&mut self, key_name: &str) {
        if !self.enabled {
            return;
        }

        let pack = match &self.active_pack {
            Some(p) => p,
            None => return,
        };

        let sound_path = match pack.resolve_keydown(key_name) {
            Some(p) => p,
            None => return,
        };

        let sound_data = match self.sounds.get(&sound_path) {
            Some(d) => d,
            None => return,
        };

        let key_volume = pack.resolve_volume(key_name);
        let final_volume = self.volume * key_volume;
        let db = amplitude_to_db(final_volume);

        let data_with_volume = sound_data.volume(Decibels(db as f32));

        if let Err(e) = self.manager.play(data_with_volume) {
            log::error!("Failed to play sound: {}", e);
        }
    }

    pub fn set_volume(&mut self, volume: f64) {
        self.volume = volume.clamp(0.0, 1.0);
    }

    pub fn get_volume(&self) -> f64 {
        self.volume
    }

    pub fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled
    }

    pub fn toggle(&mut self) -> bool {
        self.enabled = !self.enabled;
        self.enabled
    }

    pub fn active_pack_id(&self) -> Option<String> {
        self.active_pack.as_ref().map(|p| p.id.clone())
    }

    /// Load a sound pack from a directory path
    pub fn load_pack_from_path(&mut self, pack_dir: &Path) -> Result<(), String> {
        let pack = SoundPack::load(pack_dir)?;
        self.load_pack(pack)
    }
}
