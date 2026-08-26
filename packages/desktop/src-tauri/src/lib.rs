//! Prism desktop shell: Tauri 2 app exposing workspace + fs commands and the `prism://` scheme.
//! The TypeScript side (`src/tauri-provider.ts`) is the only consumer of these commands.
//!
//! TODO(security): tauri.conf.json sets `app.security.csp` to null (JSON cannot carry this
//! comment). Tighten it once the renderer set (Monaco workers, PDF.js, iframes) is known.

mod error;
mod fs;
mod scheme;
mod watcher;
mod workspace;

use tauri::ipc::Response;
use tauri::{AppHandle, Emitter, Manager, RunEvent, State};

use error::AppError;
use fs::Entry;
use watcher::WatcherState;
use workspace::{WorkspaceInfo, WorkspaceState};

#[tauri::command]
fn workspace_initial(state: State<'_, WorkspaceState>) -> Option<String> {
    state.initial()
}

#[tauri::command]
fn workspace_open(
    app: AppHandle,
    state: State<'_, WorkspaceState>,
    watchers: State<'_, WatcherState>,
    path: String,
) -> Result<WorkspaceInfo, AppError> {
    let info = state.open(&path)?;
    eprintln!("[prism] workspace: {}", info.root);
    // Stop the previous watcher before starting the new one; a watcher failure is an error
    // for the caller, not a silent degradation.
    watchers.stop();
    let root = state.root()?;
    let emitter = app.clone();
    let handle = watcher::start(root, move |ev| {
        if let Err(e) = emitter.emit("fs:event", &ev) {
            eprintln!("[watcher] emit failed: {e}");
        }
    })?;
    watchers.replace(Some(handle));
    Ok(info)
}

#[tauri::command]
fn workspace_current(state: State<'_, WorkspaceState>) -> Option<WorkspaceInfo> {
    state.current()
}

#[tauri::command]
fn fs_list(state: State<'_, WorkspaceState>, dir: String) -> Result<Vec<Entry>, AppError> {
    let root = state.root()?;
    let abs = workspace::resolve_under(&root, &dir)?;
    fs::list(&root, &abs, &dir)
}

#[tauri::command]
fn fs_stat(state: State<'_, WorkspaceState>, path: String) -> Result<Entry, AppError> {
    let root = state.root()?;
    let abs = workspace::resolve_under(&root, &path)?;
    fs::stat(&root, &abs, &path)
}

/// Raw bytes, no base64: Tauri sends `Response` bodies as an ArrayBuffer to `invoke`.
#[tauri::command]
fn fs_read(state: State<'_, WorkspaceState>, path: String) -> Result<Response, AppError> {
    let abs = state.resolve(&path)?;
    Ok(Response::new(fs::read(&abs, &path)?))
}

#[tauri::command]
fn open_external(state: State<'_, WorkspaceState>, path: String) -> Result<(), AppError> {
    let abs = state.resolve(&path)?;
    tauri_plugin_opener::open_path(&abs, None::<&str>)
        .map_err(|e| AppError::Io(format!("open externally failed for {path}: {e}")))
}

/// Dev aid: the front end can write to the app's stderr (Wayland has no screenshots).
#[tauri::command]
fn log_line(line: String) {
    eprintln!("[ui] {line}");
}

/// Whether `PRISM_DEBUG=1` is set, so the UI can mirror the watcher's stderr logging.
#[tauri::command]
fn debug_enabled() -> bool {
    watcher::debug_enabled()
}

/// `prism <dir>` or `PRISM_WORKSPACE=<dir>`; the CLI argument wins.
fn initial_workspace() -> Option<String> {
    std::env::args()
        .nth(1)
        .filter(|a| !a.starts_with('-'))
        .or_else(|| std::env::var("PRISM_WORKSPACE").ok())
        .filter(|s| !s.is_empty())
}

pub fn run() {
    let state = WorkspaceState::new(initial_workspace());
    if let Some(p) = state.initial() {
        eprintln!("[prism] initial workspace: {p}");
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .manage(WatcherState::default())
        .register_uri_scheme_protocol(scheme::SCHEME, scheme::handle)
        .invoke_handler(tauri::generate_handler![
            workspace_initial,
            workspace_open,
            workspace_current,
            fs_list,
            fs_stat,
            fs_read,
            open_external,
            log_line,
            debug_enabled,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Prism")
        .run(|app, event| {
            // Stop the watcher threads deliberately before the process tears down.
            if let RunEvent::Exit = event {
                app.state::<WatcherState>().stop();
            }
        });
}
