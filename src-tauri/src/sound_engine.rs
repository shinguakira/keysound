use kira::{
    sound::static_sound::StaticSoundData, AudioManager, AudioManagerSettings, Decibels,
    DefaultBackend,
};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Instant;

use crate::sound_pack::SoundPack;

/// Minimum interval between repeated sounds for the same key (ms).
/// Prevents buzzing/crackling when holding a key down.
const KEY_REPEAT_COOLDOWN_MS: u128 = 80;

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
    /// Per-key last play time for repeat throttling
    last_play: HashMap<String, Instant>,
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
            last_play: HashMap::new(),
        })
    }

    /// Load a sound pack and pre-load all its sound files
    pub fn load_pack(&mut self, pack: SoundPack) -> Result<(), String> {
        self.sounds.clear();
        self.last_play.clear();

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

    /// Play the sound for a keypress.
    /// Throttles repeated plays of the same key to avoid buzzing on key hold.
    pub fn play_key(&mut self, key_name: &str) {
        if !self.enabled {
            return;
        }

        // Per-key cooldown: skip if same key was played too recently
        let now = Instant::now();
        if let Some(last) = self.last_play.get(key_name) {
            if now.duration_since(*last).as_millis() < KEY_REPEAT_COOLDOWN_MS {
                return;
            }
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

        self.last_play.insert(key_name.to_string(), now);
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

    /// Check if a key is within cooldown period (would be throttled).
    pub fn is_key_in_cooldown(&self, key_name: &str) -> bool {
        if let Some(last) = self.last_play.get(key_name) {
            Instant::now().duration_since(*last).as_millis() < KEY_REPEAT_COOLDOWN_MS
        } else {
            false
        }
    }

    /// Record a key play timestamp (for testing).
    #[cfg(test)]
    fn record_key_play(&mut self, key_name: &str) {
        self.last_play.insert(key_name.to_string(), Instant::now());
    }

    /// Record a key play at a specific instant (for testing).
    #[cfg(test)]
    fn record_key_play_at(&mut self, key_name: &str, at: Instant) {
        self.last_play.insert(key_name.to_string(), at);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;
    use std::time::Duration;

    #[test]
    fn test_amplitude_to_db_full_volume() {
        let db = amplitude_to_db(1.0);
        assert!((db - 0.0).abs() < 0.001);
    }

    #[test]
    fn test_amplitude_to_db_half_volume() {
        let db = amplitude_to_db(0.5);
        assert!((db - (-6.0206)).abs() < 0.01);
    }

    #[test]
    fn test_amplitude_to_db_zero() {
        assert_eq!(amplitude_to_db(0.0), -100.0);
    }

    #[test]
    fn test_amplitude_to_db_negative() {
        assert_eq!(amplitude_to_db(-0.5), -100.0);
    }

    #[test]
    fn test_key_cooldown_constant() {
        assert_eq!(KEY_REPEAT_COOLDOWN_MS, 80);
    }

    #[test]
    fn test_key_not_in_cooldown_initially() {
        let engine = SoundEngine::new().expect("Failed to create engine");
        assert!(!engine.is_key_in_cooldown("KeyA"));
        assert!(!engine.is_key_in_cooldown("Space"));
    }

    #[test]
    fn test_key_in_cooldown_after_play() {
        let mut engine = SoundEngine::new().expect("Failed to create engine");
        engine.record_key_play("KeyA");
        assert!(engine.is_key_in_cooldown("KeyA"));
        assert!(!engine.is_key_in_cooldown("KeyB"));
    }

    #[test]
    fn test_key_cooldown_expires() {
        let mut engine = SoundEngine::new().expect("Failed to create engine");
        let past = Instant::now() - Duration::from_millis(100);
        engine.record_key_play_at("KeyA", past);
        assert!(!engine.is_key_in_cooldown("KeyA"));
    }

    #[test]
    fn test_key_cooldown_not_expired() {
        let mut engine = SoundEngine::new().expect("Failed to create engine");
        let past = Instant::now() - Duration::from_millis(30);
        engine.record_key_play_at("KeyA", past);
        assert!(engine.is_key_in_cooldown("KeyA"));
    }

    #[test]
    fn test_key_cooldown_boundary() {
        let mut engine = SoundEngine::new().expect("Failed to create engine");
        let past = Instant::now() - Duration::from_millis(80);
        engine.record_key_play_at("KeyA", past);
        assert!(!engine.is_key_in_cooldown("KeyA"));
    }

    #[test]
    fn test_key_cooldown_independent_keys() {
        let mut engine = SoundEngine::new().expect("Failed to create engine");
        engine.record_key_play("KeyA");
        engine.record_key_play("KeyB");
        assert!(engine.is_key_in_cooldown("KeyA"));
        assert!(engine.is_key_in_cooldown("KeyB"));
        assert!(!engine.is_key_in_cooldown("KeyC"));
    }

    #[test]
    fn test_volume_clamp() {
        let mut engine = SoundEngine::new().expect("Failed to create engine");
        engine.set_volume(0.5);
        assert!((engine.get_volume() - 0.5).abs() < 0.001);
        engine.set_volume(1.5);
        assert!((engine.get_volume() - 1.0).abs() < 0.001);
        engine.set_volume(-0.5);
        assert!((engine.get_volume() - 0.0).abs() < 0.001);
    }

    #[test]
    fn test_toggle_sound() {
        let mut engine = SoundEngine::new().expect("Failed to create engine");
        assert!(engine.is_enabled());
        assert!(!engine.toggle());
        assert!(!engine.is_enabled());
        assert!(engine.toggle());
        assert!(engine.is_enabled());
    }

    #[test]
    fn test_set_enabled() {
        let mut engine = SoundEngine::new().expect("Failed to create engine");
        engine.set_enabled(false);
        assert!(!engine.is_enabled());
        engine.set_enabled(true);
        assert!(engine.is_enabled());
    }

    #[test]
    fn test_active_pack_id_none() {
        let engine = SoundEngine::new().expect("Failed to create engine");
        assert!(engine.active_pack_id().is_none());
    }

    #[test]
    fn test_cooldown_real_wait() {
        let mut engine = SoundEngine::new().expect("Failed to create engine");
        engine.record_key_play("KeyA");
        assert!(engine.is_key_in_cooldown("KeyA"));
        thread::sleep(Duration::from_millis(90));
        assert!(!engine.is_key_in_cooldown("KeyA"));
    }
}
