# TODO

## User Custom Audio

- [ ] Let users import their own sound files (mp3/wav/ogg) as custom sound packs
- [ ] Design user data storage layout (separate from bundled packs)
- [ ] Data migration architecture for schema/format changes across versions

## Paid Content

- [ ] Define paid vs free sound pack structure
- [ ] Pack installation/management flow (download, install, verify license)
- [ ] Licensing/DRM approach (online check, local key, etc.)

## Update Mechanism

- [ ] In-app update notification and installation (tauri-plugin-updater)
- [ ] Sound pack update channel (independent of app updates)

## Multi-Platform

- [ ] macOS support (codesigning, notarization, accessibility permissions for rdev)
- [ ] Linux support (X11/Wayland input capture, packaging: AppImage/deb/rpm)
- [ ] CI/CD matrix builds per platform
