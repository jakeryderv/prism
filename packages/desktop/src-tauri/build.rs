fn main() {
    // Generates `allow-<command>` / `deny-<command>` permissions for our own commands so
    // capabilities/default.json can grant them explicitly (see Tauri 2 capabilities).
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "workspace_initial",
            "workspace_open",
            "workspace_current",
            "fs_list",
            "fs_stat",
            "fs_read",
            "open_external",
            "log_line",
        ]),
    ))
    .expect("failed to run tauri-build");
}
