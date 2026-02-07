use rdev::{listen, Event, EventType, Key};
use std::sync::mpsc;
use std::thread;

/// Convert an rdev::Key to the string used in pack.json
pub fn key_to_string(key: &Key) -> String {
    format!("{:?}", key)
}

/// Start the global keyboard listener on a dedicated thread.
/// Returns a receiver that yields key names on keydown events.
pub fn start_listener() -> mpsc::Receiver<String> {
    let (tx, rx) = mpsc::channel();

    thread::spawn(move || {
        if let Err(e) = listen(move |event: Event| {
            if let EventType::KeyPress(key) = event.event_type {
                let key_name = key_to_string(&key);
                let _ = tx.send(key_name);
            }
        }) {
            log::error!("Keyboard listener error: {:?}", e);
        }
    });

    rx
}
