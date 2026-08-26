//! The `prism://` URI scheme: `prism://localhost/<absolute path>` → file bytes.
//!
//! Tauri's built-in `asset://` protocol encodes the whole path into one URL segment, which
//! breaks relative resolution inside HTML previews (ADR-0001, spike results). This scheme keeps
//! real path segments so `<base href>` and relative `src`/`href` resolve. Scope: only files
//! under the current workspace root; `..` components are rejected before touching the disk.

use std::borrow::Cow;
use std::path::{Path, PathBuf};

use percent_encoding::percent_decode_str;
use tauri::http::{header, Request, Response, StatusCode};
use tauri::{Manager, UriSchemeContext};

use crate::error::AppError;
use crate::workspace::check_under;

pub const SCHEME: &str = "prism";

/// Extract the absolute filesystem path from a request URI's path component.
///
/// Accepts `prism://localhost/abs/path` (Linux/macOS) and `http://prism.localhost/abs/path`
/// (Windows) alike, since only the path component is used. Percent-decoding means a file whose
/// name contains `%` round-trips when the front end encodes each segment.
pub fn path_from_uri_path(uri_path: &str) -> Result<PathBuf, AppError> {
    let decoded = percent_decode_str(uri_path).decode_utf8().map_err(|_| {
        AppError::Forbidden(format!(
            "path is not valid UTF-8 after decoding: {uri_path}"
        ))
    })?;
    if !decoded.starts_with('/') {
        return Err(AppError::Forbidden(format!(
            "expected an absolute path: {decoded}"
        )));
    }
    Ok(PathBuf::from(decoded.into_owned()))
}

/// Resolve a request path to a readable file under `root`, or a typed error. Pure so it can be
/// tested without a Tauri runtime.
pub fn resolve_request(root: &Path, uri_path: &str) -> Result<PathBuf, AppError> {
    let abs = path_from_uri_path(uri_path)?;
    let canon = check_under(root, &abs)?;
    if canon.is_dir() {
        return Err(AppError::IsDirectory(format!(
            "is a directory: {}",
            canon.display()
        )));
    }
    Ok(canon)
}

pub fn content_type(path: &Path) -> String {
    mime_guess::from_path(path)
        .first_raw()
        .unwrap_or("application/octet-stream")
        .to_string()
}

fn status_for(err: &AppError) -> StatusCode {
    match err {
        AppError::NotFound(_) => StatusCode::NOT_FOUND,
        AppError::Forbidden(_) => StatusCode::FORBIDDEN,
        AppError::IsDirectory(_) | AppError::NotDirectory(_) | AppError::Unsupported(_) => {
            StatusCode::BAD_REQUEST
        }
        AppError::Io(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

fn respond(status: StatusCode, content_type: &str, body: Vec<u8>) -> Response<Cow<'static, [u8]>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CONTENT_LENGTH, body.len())
        // The webview origin is tauri://localhost (or http://localhost:1420 in dev), so
        // fetch() and <iframe> access to prism:// needs CORS to allow it.
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(Cow::Owned(body))
        .expect("static response headers are valid")
}

/// Handler passed to `register_uri_scheme_protocol`. Whole-file bodies; no streaming.
pub fn handle<R: tauri::Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
) -> Response<Cow<'static, [u8]>> {
    let state = ctx.app_handle().state::<crate::workspace::WorkspaceState>();
    let uri_path = request.uri().path();
    let result = state
        .root()
        .and_then(|root| resolve_request(&root, uri_path))
        .and_then(|file| {
            let ct = content_type(&file);
            std::fs::read(&file)
                .map(|bytes| (ct, bytes))
                .map_err(|e| AppError::from_io(e, &file.to_string_lossy()))
        });
    match result {
        Ok((ct, bytes)) => respond(StatusCode::OK, &ct, bytes),
        Err(err) => {
            eprintln!("[prism] {SCHEME}://{uri_path} -> {err}");
            respond(
                status_for(&err),
                "text/plain; charset=utf-8",
                err.to_string().into_bytes(),
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn ws() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        fs::create_dir_all(root.join("site")).unwrap();
        fs::write(root.join("site/index.html"), "<p>hi</p>").unwrap();
        fs::write(root.join("site/50% off.svg"), "<svg/>").unwrap();
        (dir, root)
    }

    fn encode(p: &Path) -> String {
        use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
        p.to_str()
            .unwrap()
            .split('/')
            .map(|s| utf8_percent_encode(s, NON_ALPHANUMERIC).to_string())
            .collect::<Vec<_>>()
            .join("/")
    }

    #[test]
    fn decodes_percent_encoded_segments() {
        let (_d, root) = ws();
        let file = root.join("site/50% off.svg");
        let uri = encode(&file);
        assert!(uri.contains("50%25%20off"));
        assert_eq!(resolve_request(&root, &uri).unwrap(), file);
        assert_eq!(content_type(&file), "image/svg+xml");
    }

    #[test]
    fn serves_plain_paths() {
        let (_d, root) = ws();
        let file = root.join("site/index.html");
        assert_eq!(
            resolve_request(&root, file.to_str().unwrap()).unwrap(),
            file
        );
        assert_eq!(content_type(&file), "text/html");
    }

    #[test]
    fn rejects_outside_and_dotdot() {
        let (_d, root) = ws();
        let dotdot = format!("{}/site/../../etc/passwd", root.display());
        assert_eq!(
            resolve_request(&root, &dotdot).unwrap_err().code(),
            "forbidden"
        );
        let encoded_dotdot = format!("{}/site/%2E%2E/%2E%2E/etc/passwd", root.display());
        assert_eq!(
            resolve_request(&root, &encoded_dotdot).unwrap_err().code(),
            "forbidden"
        );
        assert_eq!(
            resolve_request(&root, "/etc/hostname").unwrap_err().code(),
            "forbidden"
        );
        assert_eq!(
            resolve_request(&root, "relative").unwrap_err().code(),
            "forbidden"
        );
    }

    #[test]
    fn missing_is_404_and_dir_is_400() {
        let (_d, root) = ws();
        let missing = format!("{}/site/nope.css", root.display());
        let err = resolve_request(&root, &missing).unwrap_err();
        assert_eq!(err.code(), "not-found");
        assert_eq!(status_for(&err), StatusCode::NOT_FOUND);
        let dir = format!("{}/site", root.display());
        let err = resolve_request(&root, &dir).unwrap_err();
        assert_eq!(err.code(), "is-directory");
        assert_eq!(status_for(&err), StatusCode::BAD_REQUEST);
        assert_eq!(
            status_for(&AppError::Forbidden(String::new())),
            StatusCode::FORBIDDEN
        );
    }

    #[test]
    fn response_has_cors_and_type() {
        let r = respond(StatusCode::OK, "text/html", b"x".to_vec());
        assert_eq!(r.headers()[header::ACCESS_CONTROL_ALLOW_ORIGIN], "*");
        assert_eq!(r.headers()[header::CONTENT_TYPE], "text/html");
        assert_eq!(r.headers()[header::CONTENT_LENGTH], "1");
    }
}
