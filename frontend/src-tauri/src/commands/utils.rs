use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

pub fn compute_dir_checksum(dir: &Path) -> Option<String> {
    let mut hasher = Sha256::new();
    let mut found_files = false;

    let mut paths: Vec<PathBuf> = WalkDir::new(dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| e.into_path())
        .collect();

    paths.sort();

    for path in paths {
        if let Ok(content) = std::fs::read(&path) {
            let relative = path.strip_prefix(dir).unwrap_or(&path);
            hasher.update(relative.to_string_lossy().as_bytes());
            hasher.update(&content);
            found_files = true;
        }
    }

    if found_files {
        Some(hex::encode(hasher.finalize()))
    } else {
        None
    }
}

pub fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<u64> {
    let mut count = 0u64;
    std::fs::create_dir_all(dst)?;

    for entry in WalkDir::new(src).into_iter().filter_map(|e| e.ok()) {
        let src_path = entry.path();
        let relative = src_path.strip_prefix(src).unwrap_or(src_path);
        let dst_path = dst.join(relative);

        if entry.file_type().is_dir() {
            std::fs::create_dir_all(&dst_path)?;
        } else if entry.file_type().is_file() {
            if let Some(parent) = dst_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(src_path, &dst_path)?;
            count += 1;
        }
    }

    Ok(count)
}
