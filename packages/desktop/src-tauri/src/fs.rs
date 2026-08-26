//! Filesystem commands. All paths are workspace-relative; resolution and the escape check live
//! in `workspace.rs`. Ignore rules are the watcher's concern, not the lister's.

use std::fs::Metadata;
use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::Serialize;

use crate::error::AppError;
use crate::workspace::relative_to;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Entry {
    pub path: String,
    pub name: String,
    pub kind: EntryKind,
    pub size: u64,
    /// Unix epoch milliseconds.
    pub mtime: u64,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    Dir,
    File,
}

fn mtime_ms(meta: &Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn entry_from(root: &Path, abs: &Path, meta: &Metadata) -> Entry {
    let kind = if meta.is_dir() {
        EntryKind::Dir
    } else {
        EntryKind::File
    };
    Entry {
        path: relative_to(root, abs),
        name: abs
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
        kind,
        size: if kind == EntryKind::Dir {
            0
        } else {
            meta.len()
        },
        mtime: mtime_ms(meta),
    }
}

/// List a directory: dirs first, then files, each name-sorted. Entries whose metadata cannot
/// be read (racing deletes, broken symlinks) are skipped rather than failing the listing.
pub fn list(root: &Path, dir: &Path, rel: &str) -> Result<Vec<Entry>, AppError> {
    if !dir.is_dir() {
        return Err(AppError::NotDirectory(format!("not a directory: {rel}")));
    }
    let mut out = Vec::new();
    for de in std::fs::read_dir(dir).map_err(|e| AppError::from_io(e, rel))? {
        let Ok(de) = de else { continue };
        // Follow symlinks so a linked dir lists as a dir; skip if the target is gone.
        let Ok(meta) = std::fs::metadata(de.path()) else {
            continue;
        };
        out.push(entry_from(root, &de.path(), &meta));
    }
    out.sort_by(|a, b| a.kind.cmp(&b.kind).then_with(|| a.name.cmp(&b.name)));
    Ok(out)
}

pub fn stat(root: &Path, abs: &Path, rel: &str) -> Result<Entry, AppError> {
    let meta = std::fs::metadata(abs).map_err(|e| AppError::from_io(e, rel))?;
    Ok(entry_from(root, abs, &meta))
}

/// Whole-file read. Directories are refused with `is-directory` (streaming is out of scope).
pub fn read(abs: &Path, rel: &str) -> Result<Vec<u8>, AppError> {
    if abs.is_dir() {
        return Err(AppError::IsDirectory(format!("is a directory: {rel}")));
    }
    std::fs::read(abs).map_err(|e| AppError::from_io(e, rel))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn list_orders_dirs_then_files_by_name() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        fs::write(root.join("zeta.txt"), "z").unwrap();
        fs::write(root.join("alpha.txt"), "aa").unwrap();
        fs::create_dir(root.join("beta")).unwrap();
        fs::create_dir(root.join("aaa")).unwrap();
        let names: Vec<(String, EntryKind, String)> = list(&root, &root, "")
            .unwrap()
            .into_iter()
            .map(|e| (e.name, e.kind, e.path))
            .collect();
        assert_eq!(
            names,
            vec![
                ("aaa".into(), EntryKind::Dir, "aaa".into()),
                ("beta".into(), EntryKind::Dir, "beta".into()),
                ("alpha.txt".into(), EntryKind::File, "alpha.txt".into()),
                ("zeta.txt".into(), EntryKind::File, "zeta.txt".into()),
            ]
        );
        let sub = root.join("beta");
        fs::write(sub.join("x"), "").unwrap();
        let e = &list(&root, &sub, "beta").unwrap()[0];
        assert_eq!(e.path, "beta/x");
        assert_eq!(e.size, 0);
    }

    #[test]
    fn list_on_file_is_not_directory() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        fs::write(root.join("f"), "1").unwrap();
        assert_eq!(
            list(&root, &root.join("f"), "f").unwrap_err().code(),
            "not-directory"
        );
    }

    #[test]
    fn read_directory_is_is_directory() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        assert_eq!(read(&root, "").unwrap_err().code(), "is-directory");
        fs::write(root.join("f"), b"bytes").unwrap();
        assert_eq!(read(&root.join("f"), "f").unwrap(), b"bytes");
    }

    #[test]
    fn stat_reports_size_and_kind() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        fs::write(root.join("f"), b"12345").unwrap();
        let e = stat(&root, &root.join("f"), "f").unwrap();
        assert_eq!((e.kind, e.size, e.name.as_str()), (EntryKind::File, 5, "f"));
        assert!(e.mtime > 0);
        let r = stat(&root, &root, "").unwrap();
        assert_eq!((r.kind, r.path.as_str()), (EntryKind::Dir, ""));
    }
}
