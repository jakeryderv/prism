//! Recursive workspace watcher: notify + notify-debouncer-full for coalescing, the `ignore`
//! crate for `.gitignore` semantics, and an existence map that turns raw fs noise into core's
//! `FileEvent` (`created` | `modified` | `deleted`) per path.
//!
//! Threads: notify's own backend thread and the debouncer tick thread feed batches over a
//! channel to one std thread (`normalizer`) that stats, hashes, and emits. Nothing here runs
//! on the async runtime. Dropping `WatcherHandle` stops everything: the debouncer stops on
//! drop and closing the channel ends the normalizer thread.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::Mutex;
use std::thread::JoinHandle;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use ignore::gitignore::{Gitignore, GitignoreBuilder};
use notify::{EventKind, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebouncedEvent};
use serde::Serialize;

use crate::error::AppError;
use crate::workspace::relative_to;

/// Debounce window: events on one path within this window collapse into one.
pub const DEBOUNCE: Duration = Duration::from_millis(150);
/// A file modified more recently than this is re-stat'ed once after the same delay.
pub const SETTLE: Duration = Duration::from_millis(50);
/// Files above this size get `size` but no `hash`.
pub const HASH_MAX_BYTES: u64 = 1024 * 1024;

/// Always ignored, regardless of `.gitignore`. Directory names have no trailing slash so a
/// stray *file* with the same name is ignored too (harmless, and keeps deleted-path checks
/// simple since a deleted path cannot be stat'ed).
pub const BUILTIN_IGNORES: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    ".cache",
    "__pycache__",
    ".venv",
    ".DS_Store",
    // editor temp files: vim swap/backup, emacs lock files, vim's `4913` write probe
    "*.swp",
    "*~",
    ".#*",
    "4913",
];

/// Wire shape of core's `FileEvent` (packages/core/src/provider.ts).
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct FileEvent {
    pub kind: Kind,
    /// Workspace-relative POSIX path.
    pub path: String,
    /// Unix epoch milliseconds.
    pub timestamp: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hash: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Created,
    Modified,
    Deleted,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Created => "created",
            Kind::Modified => "modified",
            Kind::Deleted => "deleted",
        }
    }
}

/// FNV-1a 64-bit as 16 lowercase hex chars; byte-for-byte the same as core's `fnv1a64`.
pub fn fnv1a64(bytes: &[u8]) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for &b in bytes {
        h ^= u64::from(b);
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{h:016x}")
}

/// `PRISM_DEBUG=1` turns on per-event stderr logging (and the UI's mirror of it).
pub fn debug_enabled() -> bool {
    std::env::var("PRISM_DEBUG").is_ok_and(|v| v == "1")
}

/// Ignore rules for one workspace: the built-in list plus the root `.gitignore`, if any.
/// Pure over `is_ignored`; nothing here touches the filesystem after construction.
pub struct IgnoreRules {
    gitignore: Gitignore,
}

impl IgnoreRules {
    /// Built-ins first, then `<root>/.gitignore` so a `!pattern` there can override them.
    /// Unparseable lines are skipped (the crate reports and continues).
    pub fn for_workspace(root: &Path) -> Self {
        let mut b = GitignoreBuilder::new(root);
        for pat in BUILTIN_IGNORES {
            b.add_line(None, pat)
                .expect("built-in ignore pattern is valid");
        }
        let gi = root.join(".gitignore");
        if gi.is_file() {
            if let Some(e) = b.add(&gi) {
                eprintln!("[watcher] .gitignore: {e}");
            }
        }
        let gitignore = b.build().unwrap_or_else(|e| {
            eprintln!("[watcher] ignore rules fell back to built-ins only: {e}");
            builtin_only(root)
        });
        Self { gitignore }
    }

    /// Whether `rel` (workspace-relative POSIX, `''` = root) or any of its parents is ignored.
    /// `is_dir` only affects patterns with a trailing slash; pass `false` for paths that no
    /// longer exist.
    pub fn is_ignored(&self, rel: &str, is_dir: bool) -> bool {
        if rel.is_empty() {
            return false;
        }
        self.gitignore
            .matched_path_or_any_parents(rel, is_dir)
            .is_ignore()
    }
}

fn builtin_only(root: &Path) -> Gitignore {
    let mut b = GitignoreBuilder::new(root);
    for pat in BUILTIN_IGNORES {
        b.add_line(None, pat)
            .expect("built-in ignore pattern is valid");
    }
    b.build().expect("built-in ignore list builds")
}

/// `rel_path -> known to exist`. Seeded by a walk at start so pre-existing files report
/// `modified` (not `created`) on their first change, then maintained from emitted events.
pub type Known = HashMap<String, bool>;

/// Walk `root` (honoring `rules`) and record every existing path as known.
pub fn seed_known(root: &Path, rules: &IgnoreRules, known: &mut Known) {
    fn walk(root: &Path, dir: &Path, rules: &IgnoreRules, known: &mut Known) {
        let Ok(rd) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in rd.flatten() {
            let abs = entry.path();
            let rel = relative_to(root, &abs);
            let is_dir = entry.file_type().is_ok_and(|t| t.is_dir());
            if rules.is_ignored(&rel, is_dir) {
                continue;
            }
            known.insert(rel, true);
            if is_dir {
                walk(root, &abs, rules, known);
            }
        }
    }
    walk(root, root, rules, known);
}

/// Turn one debounced batch into `FileEvent`s, one per touched path, ordered by first
/// appearance in the batch. Kind is decided by existence on disk versus `known`, which makes
/// rename pairs, tmp+rename atomic saves, and create+modify bursts collapse naturally: only
/// paths that still exist (or used to) produce anything. `settle` is the re-stat delay for
/// files modified within the last `settle` (pass `Duration::ZERO` in tests).
pub fn normalize(
    events: &[DebouncedEvent],
    known: &mut Known,
    root: &Path,
    rules: &IgnoreRules,
    settle: Duration,
) -> Vec<FileEvent> {
    let mut paths: Vec<PathBuf> = Vec::new();
    for ev in events {
        // Reads (inotify open/close-nowrite) change nothing and would otherwise loop: the UI
        // re-reads on `modified`, which is itself an Access event.
        if matches!(ev.event.kind, EventKind::Access(_)) {
            continue;
        }
        for p in &ev.event.paths {
            if p.starts_with(root) && !paths.contains(p) {
                paths.push(p.clone());
            }
        }
    }

    let mut out = Vec::new();
    for abs in paths {
        let rel = relative_to(root, &abs);
        if rel.is_empty() {
            continue; // the root itself (e.g. its mtime changed); the tree does not need it
        }
        let mut meta = std::fs::metadata(&abs).ok();
        if let Some(m) = &meta {
            if m.is_file() && !settle.is_zero() && modified_within(m, settle) {
                std::thread::sleep(settle);
                meta = std::fs::metadata(&abs).ok();
            }
        }
        let is_dir = meta.as_ref().is_some_and(|m| m.is_dir());
        if rules.is_ignored(&rel, is_dir) {
            continue;
        }
        let was_known = known.get(&rel).copied().unwrap_or(false);
        let ev = match meta {
            None => {
                if !was_known {
                    continue; // came and went inside the window (tmp file); never seen
                }
                known.remove(&rel);
                FileEvent {
                    kind: Kind::Deleted,
                    path: rel,
                    timestamp: now_ms(),
                    size: None,
                    hash: None,
                }
            }
            Some(m) => {
                let kind = if was_known {
                    Kind::Modified
                } else {
                    Kind::Created
                };
                known.insert(rel.clone(), true);
                let (size, hash) = if m.is_file() {
                    let size = m.len();
                    let hash = (size <= HASH_MAX_BYTES)
                        .then(|| std::fs::read(&abs).ok().map(|b| fnv1a64(&b)))
                        .flatten();
                    (Some(size), hash)
                } else {
                    (None, None)
                };
                FileEvent {
                    kind,
                    path: rel,
                    timestamp: now_ms(),
                    size,
                    hash,
                }
            }
        };
        out.push(ev);
    }
    out
}

fn modified_within(m: &std::fs::Metadata, window: Duration) -> bool {
    m.modified()
        .ok()
        .and_then(|t| SystemTime::now().duration_since(t).ok())
        .is_some_and(|age| age < window)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// A running watcher. Drop it to stop.
pub struct WatcherHandle {
    /// Dropped first (field order) so its threads stop before we join the normalizer.
    debouncer: Option<
        notify_debouncer_full::Debouncer<
            notify::RecommendedWatcher,
            notify_debouncer_full::RecommendedCache,
        >,
    >,
    normalizer: Option<JoinHandle<()>>,
}

impl Drop for WatcherHandle {
    fn drop(&mut self) {
        if let Some(d) = self.debouncer.take() {
            d.stop(); // joins the tick thread; also drops its sender, closing the channel
        }
        if let Some(t) = self.normalizer.take() {
            let _ = t.join();
        }
    }
}

/// Start watching `root` (canonical) recursively. `sink` receives each normalized event on
/// the normalizer thread; the caller decides how to deliver it (the app emits `fs:event`).
pub fn start(
    root: PathBuf,
    sink: impl Fn(FileEvent) + Send + 'static,
) -> Result<WatcherHandle, AppError> {
    let (tx, rx) = mpsc::channel::<Vec<DebouncedEvent>>();
    let mut debouncer = new_debouncer(DEBOUNCE, None, move |res| match res {
        Ok(events) => {
            let _ = tx.send(events);
        }
        Err(errors) => {
            for e in errors {
                eprintln!("[watcher] error: {e}");
            }
        }
    })
    .map_err(|e| AppError::Io(format!("watcher init failed: {e}")))?;
    debouncer
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|e| AppError::Io(format!("cannot watch {}: {e}", root.display())))?;

    let normalizer = std::thread::Builder::new()
        .name("prism-watcher".into())
        .spawn(move || {
            let rules = IgnoreRules::for_workspace(&root);
            let mut known = Known::new();
            seed_known(&root, &rules, &mut known);
            if debug_enabled() {
                eprintln!(
                    "[watcher] watching {} ({} known paths)",
                    root.display(),
                    known.len()
                );
            }
            while let Ok(batch) = rx.recv() {
                for ev in normalize(&batch, &mut known, &root, &rules, SETTLE) {
                    if debug_enabled() {
                        eprintln!(
                            "[watcher] {} {} size={} hash={}",
                            ev.kind.as_str(),
                            ev.path,
                            ev.size.map_or("-".to_string(), |s| s.to_string()),
                            ev.hash.as_deref().unwrap_or("-")
                        );
                    }
                    sink(ev);
                }
            }
        })
        .map_err(|e| AppError::Io(format!("watcher thread failed: {e}")))?;

    Ok(WatcherHandle {
        debouncer: Some(debouncer),
        normalizer: Some(normalizer),
    })
}

/// Tauri-managed slot for the current watcher; replacing it stops the previous one.
#[derive(Default)]
pub struct WatcherState(Mutex<Option<WatcherHandle>>);

impl WatcherState {
    pub fn replace(&self, handle: Option<WatcherHandle>) {
        // Take first so the old watcher is dropped outside the lock.
        let old = std::mem::replace(&mut *self.0.lock().expect("watcher mutex poisoned"), handle);
        drop(old);
    }

    pub fn stop(&self) {
        self.replace(None);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{AccessKind, AccessMode, CreateKind, ModifyKind, RemoveKind, RenameMode};
    use notify::Event;
    use std::fs;
    use std::time::Instant;

    fn ws() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        (dir, root)
    }

    fn ev(kind: EventKind, paths: &[&Path]) -> DebouncedEvent {
        DebouncedEvent::new(Event::new(kind).with_paths_slice(paths), Instant::now())
    }

    trait WithPaths {
        fn with_paths_slice(self, paths: &[&Path]) -> Self;
    }
    impl WithPaths for Event {
        fn with_paths_slice(mut self, paths: &[&Path]) -> Self {
            self.paths = paths.iter().map(|p| p.to_path_buf()).collect();
            self
        }
    }

    fn run(
        root: &Path,
        rules: &IgnoreRules,
        known: &mut Known,
        batch: &[DebouncedEvent],
    ) -> Vec<(Kind, String)> {
        normalize(batch, known, root, rules, Duration::ZERO)
            .into_iter()
            .map(|e| (e.kind, e.path))
            .collect()
    }

    #[test]
    fn fnv1a64_matches_core() {
        // Vectors generated with `bun -e` from packages/core/src/hash.ts.
        assert_eq!(fnv1a64(b""), "cbf29ce484222325");
        assert_eq!(fnv1a64(b"a"), "af63dc4c8601ec8c");
        assert_eq!(fnv1a64(b"hello world"), "779a65e7023cd2e7");
        assert_eq!(fnv1a64(b"# Prism\n"), "c2d2bfda2f0b556f");
        let all: Vec<u8> = (0..=255).collect();
        assert_eq!(fnv1a64(&all), "4242dc5249c33625");
    }

    #[test]
    fn builtin_ignores() {
        let (_d, root) = ws();
        let r = IgnoreRules::for_workspace(&root);
        assert!(!r.is_ignored("", true));
        assert!(!r.is_ignored("src/main.rs", false));
        assert!(r.is_ignored(".git", true));
        assert!(r.is_ignored(".git/HEAD", false));
        assert!(r.is_ignored("node_modules/x/index.js", false));
        assert!(r.is_ignored("pkg/node_modules/x/index.js", false));
        assert!(r.is_ignored("target/debug/prism", false));
        assert!(r.is_ignored("dist", true));
        assert!(r.is_ignored("a/.cache/b", false));
        assert!(r.is_ignored("__pycache__/m.pyc", false));
        assert!(r.is_ignored(".venv/bin/python", false));
        assert!(r.is_ignored("docs/.DS_Store", false));
        assert!(r.is_ignored("notes.md.swp", false));
        assert!(r.is_ignored("notes.md~", false));
        assert!(r.is_ignored("src/.#notes.md", false));
        assert!(r.is_ignored("src/4913", false));
        assert!(!r.is_ignored("distribution/x", false));
    }

    #[test]
    fn root_gitignore_is_honored_and_can_override() {
        let (_d, root) = ws();
        fs::write(root.join(".gitignore"), "*.log\nbuild/\n!dist\n").unwrap();
        let r = IgnoreRules::for_workspace(&root);
        assert!(r.is_ignored("out/app.log", false));
        assert!(r.is_ignored("build", true));
        assert!(r.is_ignored("build/x", false));
        assert!(!r.is_ignored("build", false)); // trailing slash: directories only
        assert!(!r.is_ignored("dist/x", false)); // negated built-in
        assert!(r.is_ignored("node_modules/x", false));
    }

    #[test]
    fn create_modify_burst_is_one_created() {
        let (_d, root) = ws();
        let r = IgnoreRules::for_workspace(&root);
        let mut known = Known::new();
        let f = root.join("a.md");
        fs::write(&f, "hello world").unwrap();
        let batch = [
            ev(EventKind::Create(CreateKind::File), &[&f]),
            ev(
                EventKind::Modify(ModifyKind::Data(notify::event::DataChange::Any)),
                &[&f],
            ),
        ];
        let out = normalize(&batch, &mut known, &root, &r, Duration::ZERO);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].kind, Kind::Created);
        assert_eq!(out[0].path, "a.md");
        assert_eq!(out[0].size, Some(11));
        assert_eq!(out[0].hash.as_deref(), Some("779a65e7023cd2e7"));
        assert!(out[0].timestamp > 0);
        assert_eq!(known.get("a.md"), Some(&true));

        // Second change to a known path is `modified`.
        fs::write(&f, "changed").unwrap();
        let batch = [ev(EventKind::Modify(ModifyKind::Any), &[&f])];
        assert_eq!(
            run(&root, &r, &mut known, &batch),
            vec![(Kind::Modified, "a.md".into())]
        );
    }

    #[test]
    fn seeded_paths_report_modified() {
        let (_d, root) = ws();
        fs::create_dir(root.join("node_modules")).unwrap();
        fs::write(root.join("node_modules/x.js"), "x").unwrap();
        fs::create_dir(root.join("sub")).unwrap();
        fs::write(root.join("sub/b.txt"), "b").unwrap();
        let r = IgnoreRules::for_workspace(&root);
        let mut known = Known::new();
        seed_known(&root, &r, &mut known);
        assert_eq!(known.get("sub"), Some(&true));
        assert_eq!(known.get("sub/b.txt"), Some(&true));
        assert!(!known.contains_key("node_modules"));
        assert!(!known.contains_key("node_modules/x.js"));
        let f = root.join("sub/b.txt");
        let batch = [ev(EventKind::Modify(ModifyKind::Any), &[&f])];
        assert_eq!(
            run(&root, &r, &mut known, &batch),
            vec![(Kind::Modified, "sub/b.txt".into())]
        );
    }

    #[test]
    fn delete_known_and_ignore_unknown() {
        let (_d, root) = ws();
        let r = IgnoreRules::for_workspace(&root);
        let mut known = Known::new();
        known.insert("gone.md".into(), true);
        let batch = [
            ev(
                EventKind::Remove(RemoveKind::File),
                &[&root.join("gone.md")],
            ),
            ev(
                EventKind::Remove(RemoveKind::File),
                &[&root.join("never.md")],
            ),
        ];
        assert_eq!(
            run(&root, &r, &mut known, &batch),
            vec![(Kind::Deleted, "gone.md".into())]
        );
        assert!(!known.contains_key("gone.md"));
    }

    #[test]
    fn atomic_save_is_one_modified() {
        let (_d, root) = ws();
        let r = IgnoreRules::for_workspace(&root);
        let mut known = Known::new();
        let target = root.join("x.md");
        let tmp = root.join("x.md.tmp");
        fs::write(&target, "old").unwrap();
        known.insert("x.md".into(), true);
        // What an editor does: write tmp, rename over target. On disk only x.md remains.
        fs::write(&tmp, "new").unwrap();
        fs::rename(&tmp, &target).unwrap();
        let batch = [
            ev(EventKind::Create(CreateKind::File), &[&tmp]),
            ev(
                EventKind::Modify(ModifyKind::Data(notify::event::DataChange::Any)),
                &[&tmp],
            ),
            ev(
                EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
                &[&tmp, &target],
            ),
        ];
        let out = normalize(&batch, &mut known, &root, &r, Duration::ZERO);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].kind, Kind::Modified);
        assert_eq!(out[0].path, "x.md");
        assert_eq!(out[0].size, Some(3));
        assert_eq!(out[0].hash.as_deref(), Some(fnv1a64(b"new").as_str()));
        assert!(!known.contains_key("x.md.tmp"));
    }

    #[test]
    fn rename_is_deleted_plus_created() {
        let (_d, root) = ws();
        let r = IgnoreRules::for_workspace(&root);
        let mut known = Known::new();
        let a = root.join("a.md");
        let b = root.join("b.md");
        fs::write(&a, "a").unwrap();
        known.insert("a.md".into(), true);
        fs::rename(&a, &b).unwrap();
        let batch = [ev(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &[&a, &b],
        )];
        assert_eq!(
            run(&root, &r, &mut known, &batch),
            vec![
                (Kind::Deleted, "a.md".into()),
                (Kind::Created, "b.md".into())
            ]
        );
    }

    #[test]
    fn ignored_paths_never_emit() {
        let (_d, root) = ws();
        let r = IgnoreRules::for_workspace(&root);
        let mut known = Known::new();
        fs::create_dir_all(root.join("node_modules/p")).unwrap();
        fs::write(root.join("node_modules/p/i.js"), "x").unwrap();
        fs::create_dir_all(root.join(".git")).unwrap();
        fs::write(root.join(".git/HEAD"), "ref").unwrap();
        fs::write(root.join("a.md.swp"), "swap").unwrap();
        let batch = [
            ev(
                EventKind::Create(CreateKind::File),
                &[&root.join("node_modules/p/i.js")],
            ),
            ev(
                EventKind::Modify(ModifyKind::Any),
                &[&root.join(".git/HEAD")],
            ),
            ev(
                EventKind::Create(CreateKind::File),
                &[&root.join("a.md.swp")],
            ),
            ev(
                EventKind::Remove(RemoveKind::Any),
                &[&root.join("node_modules/q")],
            ),
        ];
        assert!(run(&root, &r, &mut known, &batch).is_empty());
        assert!(known.is_empty());
    }

    #[test]
    fn access_events_are_ignored() {
        let (_d, root) = ws();
        let r = IgnoreRules::for_workspace(&root);
        let mut known = Known::new();
        let f = root.join("read.md");
        fs::write(&f, "r").unwrap();
        known.insert("read.md".into(), true);
        let batch = [
            ev(EventKind::Access(AccessKind::Open(AccessMode::Read)), &[&f]),
            ev(
                EventKind::Access(AccessKind::Close(AccessMode::Read)),
                &[&f],
            ),
        ];
        assert!(run(&root, &r, &mut known, &batch).is_empty());
    }

    #[test]
    fn directories_emit_without_size_or_hash() {
        let (_d, root) = ws();
        let r = IgnoreRules::for_workspace(&root);
        let mut known = Known::new();
        let d = root.join("newdir");
        fs::create_dir(&d).unwrap();
        let batch = [ev(EventKind::Create(CreateKind::Folder), &[&d])];
        let out = normalize(&batch, &mut known, &root, &r, Duration::ZERO);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].kind, Kind::Created);
        assert_eq!(out[0].path, "newdir");
        assert_eq!(out[0].size, None);
        assert_eq!(out[0].hash, None);
        fs::remove_dir(&d).unwrap();
        let batch = [ev(EventKind::Remove(RemoveKind::Folder), &[&d])];
        assert_eq!(
            run(&root, &r, &mut known, &batch),
            vec![(Kind::Deleted, "newdir".into())]
        );
    }

    #[test]
    fn large_files_have_size_but_no_hash() {
        let (_d, root) = ws();
        let r = IgnoreRules::for_workspace(&root);
        let mut known = Known::new();
        let f = root.join("big.bin");
        fs::write(&f, vec![0u8; (HASH_MAX_BYTES + 1) as usize]).unwrap();
        let out = normalize(
            &[ev(EventKind::Create(CreateKind::File), &[&f])],
            &mut known,
            &root,
            &r,
            Duration::ZERO,
        );
        assert_eq!(out[0].size, Some(HASH_MAX_BYTES + 1));
        assert_eq!(out[0].hash, None);
    }

    #[test]
    fn paths_outside_root_are_dropped() {
        let (_d, root) = ws();
        let (_o, other) = ws();
        let r = IgnoreRules::for_workspace(&root);
        let mut known = Known::new();
        let f = other.join("x.md");
        fs::write(&f, "x").unwrap();
        assert!(run(
            &root,
            &r,
            &mut known,
            &[ev(EventKind::Create(CreateKind::File), &[&f])]
        )
        .is_empty());
    }

    #[test]
    fn serializes_like_core_file_event() {
        let e = FileEvent {
            kind: Kind::Created,
            path: "a.md".into(),
            timestamp: 5,
            size: Some(1),
            hash: None,
        };
        assert_eq!(
            serde_json::to_value(&e).unwrap(),
            serde_json::json!({ "kind": "created", "path": "a.md", "timestamp": 5, "size": 1 })
        );
        let e = FileEvent {
            kind: Kind::Deleted,
            path: "a.md".into(),
            timestamp: 5,
            size: None,
            hash: None,
        };
        assert_eq!(
            serde_json::to_value(&e).unwrap(),
            serde_json::json!({ "kind": "deleted", "path": "a.md", "timestamp": 5 })
        );
    }

    /// Real notify on a tempdir. Marked `#[ignore]` only if it proves flaky; run with
    /// `cargo test -- --include-ignored` in that case.
    #[test]
    fn live_watcher_reports_created_modified_deleted() {
        let (_d, root) = ws();
        let (tx, rx) = mpsc::channel();
        let handle = start(root.clone(), move |e| {
            let _ = tx.send(e);
        })
        .unwrap();
        // Let the seed walk and inotify registration settle.
        std::thread::sleep(Duration::from_millis(200));
        let f = root.join("live.md");
        fs::write(&f, "one").unwrap();
        let e = rx
            .recv_timeout(Duration::from_secs(2))
            .expect("created within 2s");
        assert_eq!((e.kind, e.path.as_str()), (Kind::Created, "live.md"));
        fs::write(&f, "two").unwrap();
        let e = rx
            .recv_timeout(Duration::from_secs(2))
            .expect("modified within 2s");
        assert_eq!((e.kind, e.path.as_str()), (Kind::Modified, "live.md"));
        fs::remove_file(&f).unwrap();
        let e = rx
            .recv_timeout(Duration::from_secs(2))
            .expect("deleted within 2s");
        assert_eq!((e.kind, e.path.as_str()), (Kind::Deleted, "live.md"));
        drop(handle); // must not panic or hang
    }
}
