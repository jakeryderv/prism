//! The one error type that crosses IPC. Serialized as `{ code, message }`; the TypeScript
//! side (`TauriProvider`) maps `code` onto core's `ProviderError` codes 1:1.

use std::fmt;
use std::io;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AppError {
    NotFound(String),
    IsDirectory(String),
    NotDirectory(String),
    /// Part of the wire contract shared with core's `ProviderError`; no command emits it yet.
    #[allow(dead_code)]
    Unsupported(String),
    /// Path escapes the workspace root, or no workspace is open.
    Forbidden(String),
    Io(String),
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            AppError::NotFound(_) => "not-found",
            AppError::IsDirectory(_) => "is-directory",
            AppError::NotDirectory(_) => "not-directory",
            AppError::Unsupported(_) => "unsupported",
            AppError::Forbidden(_) => "forbidden",
            AppError::Io(_) => "io",
        }
    }

    pub fn message(&self) -> &str {
        match self {
            AppError::NotFound(m)
            | AppError::IsDirectory(m)
            | AppError::NotDirectory(m)
            | AppError::Unsupported(m)
            | AppError::Forbidden(m)
            | AppError::Io(m) => m,
        }
    }

    /// Map an io::Error for `path` onto the typed variants the UI can branch on.
    pub fn from_io(err: io::Error, path: &str) -> Self {
        match err.kind() {
            io::ErrorKind::NotFound => AppError::NotFound(format!("not found: {path}")),
            io::ErrorKind::PermissionDenied => {
                AppError::Forbidden(format!("permission denied: {path}"))
            }
            // Stable since 1.83 as IsADirectory/NotADirectory; the raw kinds are still the
            // reliable signal on Linux, so match on the message-free kind and fall back to io.
            io::ErrorKind::IsADirectory => AppError::IsDirectory(format!("is a directory: {path}")),
            io::ErrorKind::NotADirectory => {
                AppError::NotDirectory(format!("not a directory: {path}"))
            }
            _ => AppError::Io(format!("{path}: {err}")),
        }
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code(), self.message())
    }
}

impl std::error::Error for AppError {}

impl From<io::Error> for AppError {
    fn from(err: io::Error) -> Self {
        AppError::from_io(err, "")
    }
}

impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut st = s.serialize_struct("AppError", 2)?;
        st.serialize_field("code", self.code())?;
        st.serialize_field("message", self.message())?;
        st.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_as_code_and_message() {
        let e = AppError::Forbidden("nope".into());
        let v = serde_json::to_value(&e).unwrap();
        assert_eq!(
            v,
            serde_json::json!({ "code": "forbidden", "message": "nope" })
        );
    }

    #[test]
    fn maps_io_kinds() {
        let e = AppError::from_io(io::Error::from(io::ErrorKind::NotFound), "a");
        assert_eq!(e.code(), "not-found");
        let e = AppError::from_io(io::Error::from(io::ErrorKind::PermissionDenied), "a");
        assert_eq!(e.code(), "forbidden");
        let e = AppError::from_io(io::Error::other("boom"), "a");
        assert_eq!(e.code(), "io");
    }
}
