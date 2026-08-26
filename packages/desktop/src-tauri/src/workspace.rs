//! Workspace root state and workspace-relative path resolution with the escape check.
//!
//! Paths crossing IPC are workspace-relative POSIX ('' = root) exactly like core's
//! `normalizePath`. Every resolution canonicalizes and checks that the result stays under
//! the canonical root, so symlinks and `..` cannot reach outside the workspace.

use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;

use crate::error::AppError;

#[derive(Default)]
pub struct WorkspaceState {
    root: Mutex<Option<PathBuf>>,
    /// Path handed over on the command line / `PRISM_WORKSPACE`, consumed by the UI at startup.
    initial: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct WorkspaceInfo {
    pub root: String,
}

impl WorkspaceState {
    pub fn new(initial: Option<String>) -> Self {
        Self {
            root: Mutex::new(None),
            initial,
        }
    }

    pub fn initial(&self) -> Option<String> {
        self.initial.clone()
    }

    /// Canonicalize `path`, require a directory, and make it the current root.
    pub fn open(&self, path: &str) -> Result<WorkspaceInfo, AppError> {
        let root = std::fs::canonicalize(path).map_err(|e| AppError::from_io(e, path))?;
        if !root.is_dir() {
            return Err(AppError::NotDirectory(format!("not a directory: {path}")));
        }
        let info = WorkspaceInfo {
            root: root.to_string_lossy().into_owned(),
        };
        *self.root.lock().expect("workspace mutex poisoned") = Some(root);
        Ok(info)
    }

    pub fn current(&self) -> Option<WorkspaceInfo> {
        self.root
            .lock()
            .expect("workspace mutex poisoned")
            .as_ref()
            .map(|r| WorkspaceInfo {
                root: r.to_string_lossy().into_owned(),
            })
    }

    pub fn root(&self) -> Result<PathBuf, AppError> {
        self.root
            .lock()
            .expect("workspace mutex poisoned")
            .clone()
            .ok_or_else(|| AppError::Forbidden("no workspace is open".into()))
    }

    /// Resolve a workspace-relative path to an absolute one inside the current root.
    pub fn resolve(&self, rel: &str) -> Result<PathBuf, AppError> {
        resolve_under(&self.root()?, rel)
    }
}

/// Join a workspace-relative POSIX path onto `root` and verify the result stays inside it.
/// `root` must already be canonical. The returned path is canonical (it must exist).
pub fn resolve_under(root: &Path, rel: &str) -> Result<PathBuf, AppError> {
    if rel.starts_with('/') || rel.starts_with('\\') {
        return Err(AppError::Forbidden(format!(
            "absolute path not allowed: {rel}"
        )));
    }
    let mut p = root.to_path_buf();
    for seg in rel.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                return Err(AppError::Forbidden(format!(
                    "path escapes workspace: {rel}"
                )))
            }
            s => p.push(s),
        }
    }
    check_under(root, &p).map_err(|e| match e {
        AppError::NotFound(_) => AppError::NotFound(format!("not found: {rel}")),
        other => other,
    })
}

/// Canonicalize `abs` and verify it is `root` or inside it. Rejects `..` components up front
/// so a request cannot even probe outside the root.
pub fn check_under(root: &Path, abs: &Path) -> Result<PathBuf, AppError> {
    let shown = abs.to_string_lossy();
    if abs.components().any(|c| c == Component::ParentDir) {
        return Err(AppError::Forbidden(format!(
            "path escapes workspace: {shown}"
        )));
    }
    let canon = std::fs::canonicalize(abs).map_err(|e| AppError::from_io(e, &shown))?;
    if !canon.starts_with(root) {
        return Err(AppError::Forbidden(format!(
            "path escapes workspace: {shown}"
        )));
    }
    Ok(canon)
}

/// Workspace-relative POSIX form of a canonical path under `root`.
pub fn relative_to(root: &Path, abs: &Path) -> String {
    abs.strip_prefix(root)
        .map(|r| {
            r.components()
                .map(|c| c.as_os_str().to_string_lossy().into_owned())
                .collect::<Vec<_>>()
                .join("/")
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn ws() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        fs::create_dir_all(root.join("sub/deep")).unwrap();
        fs::write(root.join("a.txt"), "a").unwrap();
        fs::write(root.join("sub/b.txt"), "b").unwrap();
        (dir, root)
    }

    #[test]
    fn resolves_root_and_children() {
        let (_d, root) = ws();
        assert_eq!(resolve_under(&root, "").unwrap(), root);
        assert_eq!(resolve_under(&root, "a.txt").unwrap(), root.join("a.txt"));
        assert_eq!(
            resolve_under(&root, "sub/b.txt").unwrap(),
            root.join("sub/b.txt")
        );
        assert_eq!(
            resolve_under(&root, "./sub//deep/").unwrap(),
            root.join("sub/deep")
        );
    }

    #[test]
    fn rejects_escapes() {
        let (_d, root) = ws();
        assert_eq!(
            resolve_under(&root, "../x").unwrap_err().code(),
            "forbidden"
        );
        assert_eq!(
            resolve_under(&root, "sub/../../x").unwrap_err().code(),
            "forbidden"
        );
        assert_eq!(
            resolve_under(&root, "/etc/passwd").unwrap_err().code(),
            "forbidden"
        );
    }

    #[test]
    fn missing_is_not_found() {
        let (_d, root) = ws();
        assert_eq!(
            resolve_under(&root, "nope.txt").unwrap_err().code(),
            "not-found"
        );
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_out_of_root() {
        let (_d, root) = ws();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("secret"), "s").unwrap();
        std::os::unix::fs::symlink(outside.path().join("secret"), root.join("link")).unwrap();
        assert_eq!(
            resolve_under(&root, "link").unwrap_err().code(),
            "forbidden"
        );
    }

    #[test]
    fn check_absolute_scope() {
        let (_d, root) = ws();
        assert_eq!(
            check_under(&root, &root.join("a.txt")).unwrap(),
            root.join("a.txt")
        );
        assert_eq!(
            check_under(&root, &root.join("sub/../a.txt"))
                .unwrap_err()
                .code(),
            "forbidden"
        );
        let parent = root.parent().unwrap().to_path_buf();
        assert_eq!(check_under(&root, &parent).unwrap_err().code(), "forbidden");
    }

    #[test]
    fn state_open_requires_directory() {
        let (_d, root) = ws();
        let st = WorkspaceState::new(None);
        assert!(st.current().is_none());
        assert_eq!(st.root().unwrap_err().code(), "forbidden");
        let e = st.open(root.join("a.txt").to_str().unwrap()).unwrap_err();
        assert_eq!(e.code(), "not-directory");
        let info = st.open(root.to_str().unwrap()).unwrap();
        assert_eq!(info.root, root.to_string_lossy());
        assert_eq!(st.current(), Some(info));
        assert_eq!(st.resolve("sub").unwrap(), root.join("sub"));
    }

    #[test]
    fn relative_form() {
        let (_d, root) = ws();
        assert_eq!(relative_to(&root, &root), "");
        assert_eq!(relative_to(&root, &root.join("sub/b.txt")), "sub/b.txt");
    }
}
