/// skill_files.rs — DB 文件存储核心模块
///
/// 提供以 `skill_files` 表为权威源的所有文件读写操作。
/// 其他模块通过这些函数读写 Skill 文件内容，不再直接操作本地文件系统。

use log::info;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use std::path::Path;
use uuid::Uuid;
use walkdir::WalkDir;

use crate::error::AppError;

// ── 单文件读取 ──────────────────────────────────────────────────────────────

/// 从 DB 读取单个文件的字节内容
pub fn db_read_file(
    conn: &Connection,
    skill_id: &str,
    rel_path: &str,
) -> Result<Vec<u8>, AppError> {
    let content: Vec<u8> = conn
        .query_row(
            "SELECT content FROM skill_files WHERE skill_id = ?1 AND relative_path = ?2",
            params![skill_id, rel_path],
            |row| row.get(0),
        )
        .map_err(|_| {
            AppError::NotFound(format!(
                "文件不存在: skill_id={}, path={}",
                skill_id, rel_path
            ))
        })?;
    Ok(content)
}

/// 从 DB 读取单个文件的 UTF-8 文本内容
pub fn db_read_file_text(
    conn: &Connection,
    skill_id: &str,
    rel_path: &str,
) -> Result<String, AppError> {
    let bytes = db_read_file(conn, skill_id, rel_path)?;
    String::from_utf8(bytes)
        .map_err(|e| AppError::Internal(format!("文件不是有效 UTF-8: {}", e)))
}

// ── 单文件写入 ──────────────────────────────────────────────────────────────

/// 写入单个文件到 DB（UPSERT）
pub fn db_write_file(
    conn: &Connection,
    skill_id: &str,
    rel_path: &str,
    content: &[u8],
) -> Result<(), AppError> {
    let id = Uuid::new_v4().to_string();
    let size = content.len() as i64;
    conn.execute(
        "INSERT INTO skill_files (id, skill_id, relative_path, content, size_bytes, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
         ON CONFLICT(skill_id, relative_path) DO UPDATE SET
            content = ?4, size_bytes = ?5, updated_at = datetime('now')",
        params![id, skill_id, rel_path, content, size],
    )?;
    Ok(())
}

/// 写入文本文件到 DB（便捷函数）
pub fn db_write_file_text(
    conn: &Connection,
    skill_id: &str,
    rel_path: &str,
    content: &str,
) -> Result<(), AppError> {
    db_write_file(conn, skill_id, rel_path, content.as_bytes())
}

/// 删除 DB 中的单个文件
pub fn db_delete_file(
    conn: &Connection,
    skill_id: &str,
    rel_path: &str,
) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM skill_files WHERE skill_id = ?1 AND relative_path = ?2",
        params![skill_id, rel_path],
    )?;
    Ok(())
}

// ── 文件列表 ────────────────────────────────────────────────────────────────

/// 列出 Skill 的所有文件的相对路径（已排序）
pub fn db_list_files(
    conn: &Connection,
    skill_id: &str,
) -> Result<Vec<String>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT relative_path FROM skill_files WHERE skill_id = ?1 ORDER BY relative_path",
    )?;
    let files = stmt
        .query_map(params![skill_id], |row| row.get(0))?
        .collect::<Result<Vec<String>, _>>()?;
    Ok(files)
}

// ── 批量导入：目录 → DB ──────────────────────────────────────────────────────

/// 将本地目录中的所有文件导入到 DB skill_files 表（UPSERT）
/// 返回写入的文件数量
pub fn db_import_from_dir(
    conn: &Connection,
    skill_id: &str,
    dir: &Path,
) -> Result<usize, AppError> {
    if !dir.exists() || !dir.is_dir() {
        return Err(AppError::Validation(format!(
            "目录不存在: {}",
            dir.display()
        )));
    }

    let mut count = 0usize;

    let mut paths: Vec<std::path::PathBuf> = WalkDir::new(dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| e.into_path())
        .collect();
    paths.sort();

    for path in paths {
        let rel = path
            .strip_prefix(dir)
            .unwrap_or(&path)
            .to_string_lossy()
            .to_string();

        // 跳过隐藏文件和系统文件
        if rel.starts_with('.') || rel.contains("/.") {
            continue;
        }

        match std::fs::read(&path) {
            Ok(content) => {
                db_write_file(conn, skill_id, &rel, &content)?;
                count += 1;
            }
            Err(e) => {
                info!(
                    "[skill_files] 读取文件失败 {} — {}，跳过",
                    path.display(),
                    e
                );
            }
        }
    }

    info!(
        "[skill_files] db_import_from_dir: skill={}, dir={}, count={}",
        skill_id,
        dir.display(),
        count
    );
    Ok(count)
}

// ── 批量导出：DB → 目录 ──────────────────────────────────────────────────────

/// 将 DB 中 Skill 的所有文件写出到目标目录（用于部署）
/// 返回写出的文件数量
pub fn db_export_to_dir(
    conn: &Connection,
    skill_id: &str,
    dst: &Path,
) -> Result<usize, AppError> {
    let files = db_list_files(conn, skill_id)?;

    if files.is_empty() {
        return Err(AppError::Validation(format!(
            "Skill 在 DB 中没有文件，请重新导入。skill_id={}",
            skill_id
        )));
    }

    std::fs::create_dir_all(dst)?;
    let mut count = 0usize;

    for rel_path in &files {
        let content = db_read_file(conn, skill_id, rel_path)?;
        let target = dst.join(rel_path);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&target, &content)?;
        count += 1;
    }

    info!(
        "[skill_files] db_export_to_dir: skill={}, dst={}, count={}",
        skill_id,
        dst.display(),
        count
    );
    Ok(count)
}

/// 将 DB 中 Skill 的文件写出到标准库路径 `~/.skills-manager/skills/{name}`，
/// 返回该路径（供编辑器打开等场景使用）
pub fn db_export_to_lib(
    conn: &Connection,
    skill_id: &str,
    skill_name: &str,
) -> Result<std::path::PathBuf, AppError> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::Internal("无法获取用户主目录".into()))?;
    let lib_dir = home
        .join(".skills-manager")
        .join("skills")
        .join(skill_name);

    if lib_dir.exists() {
        let _ = std::fs::remove_dir_all(&lib_dir);
    }
    db_export_to_dir(conn, skill_id, &lib_dir)?;

    // 回写 local_path（让旧代码兼容）
    let lp = lib_dir.to_string_lossy().to_string();
    let _ = conn.execute(
        "UPDATE skills SET local_path = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![lp, skill_id],
    );

    Ok(lib_dir)
}

// ── Checksum 计算 ────────────────────────────────────────────────────────────

/// 从 DB skill_files 内容计算 Skill 的 SHA-256 checksum
/// 算法与 compute_dir_checksum 一致：对每个文件的 (relative_path + content) 做哈希
pub fn compute_db_checksum(conn: &Connection, skill_id: &str) -> Option<String> {
    let mut stmt = conn
        .prepare(
            "SELECT relative_path, content FROM skill_files
             WHERE skill_id = ?1
             ORDER BY relative_path",
        )
        .ok()?;

    let rows: Vec<(String, Vec<u8>)> = stmt
        .query_map(params![skill_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Vec<u8>>(1)?))
        })
        .ok()?
        .filter_map(|r| r.ok())
        .collect();

    if rows.is_empty() {
        return None;
    }

    let mut hasher = Sha256::new();
    for (rel_path, content) in &rows {
        hasher.update(rel_path.as_bytes());
        hasher.update(content);
    }
    Some(hex::encode(hasher.finalize()))
}

/// 更新 skills 表中的 checksum（从 DB files 重新计算）
pub fn refresh_skill_checksum(conn: &Connection, skill_id: &str) -> Result<Option<String>, AppError> {
    let checksum = compute_db_checksum(conn, skill_id);
    conn.execute(
        "UPDATE skills SET checksum = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![checksum, skill_id],
    )?;
    Ok(checksum)
}

// ── 文件是否存在检测 ─────────────────────────────────────────────────────────

/// 检测 Skill 在 DB 中是否有文件（用于判断是否需要迁移）
pub fn has_db_files(conn: &Connection, skill_id: &str) -> bool {
    conn.query_row(
        "SELECT COUNT(*) FROM skill_files WHERE skill_id = ?1",
        params![skill_id],
        |row| row.get::<_, i64>(0),
    )
    .unwrap_or(0)
        > 0
}
