use log::info;
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use rusqlite::params;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;
use uuid::Uuid;
use tauri::AppHandle;
use tauri::Emitter;

use super::skill_files::{db_delete_file, db_write_file, refresh_skill_checksum};
use super::utils::compute_dir_checksum;
use crate::db::DbPool;
use crate::tools::ALL_TOOLS;

/// 收集所有需要监听的目录
fn collect_watch_paths(pool: &DbPool) -> Vec<PathBuf> {
    let mut paths = Vec::new();

    // 1. Skill 库写出缓存目录（用于编辑器打开后同步回 DB）
    if let Some(home) = dirs::home_dir() {
        let lib_path = home.join(".skills-manager").join("skills");
        if lib_path.exists() {
            paths.push(lib_path);
        }
    }

    // 2. 所有项目的工具 Skill 目录
    if let Ok(conn) = pool.get() {
        if let Ok(mut stmt) = conn.prepare("SELECT path FROM projects") {
            if let Ok(rows) = stmt.query_map([], |row| row.get::<_, String>(0)) {
                for row in rows.flatten() {
                    let project_path = Path::new(&row);
                    for tool_dir in ALL_TOOLS.iter().map(|t| t.project_dir) {
                        let skill_dir = project_path.join(tool_dir);
                        if skill_dir.exists() && skill_dir.is_dir() {
                            paths.push(skill_dir);
                        }
                    }
                }
            }
        }
    }

    paths
}

/// 从部署路径和文件路径查找 skill_id 及 relative_path
fn resolve_skill_for_file(
    pool: &DbPool,
    file_path: &str,
) -> Option<(String, String, String)> {
    // 返回 (deployment_id, skill_id, relative_path_within_skill)
    if let Ok(conn) = pool.get() {
        if let Ok((dep_id, skill_id, deploy_path)) = conn.query_row(
            "SELECT id, skill_id, path FROM skill_deployments WHERE ?1 LIKE path || '%'",
            params![file_path],
            |row| Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            )),
        ) {
            // 计算相对路径：file_path 减去 deploy_path 前缀
            let rel = file_path
                .strip_prefix(&deploy_path)
                .map(|s| s.trim_start_matches('/').trim_start_matches('\\').to_string())
                .unwrap_or_default();
            if !rel.is_empty() {
                return Some((dep_id, skill_id, rel));
            }
        }
    }
    None
}

/// 处理文件变更事件，回写到 skill_files DB 并写入 change_events
fn handle_fs_event(event: &Event, pool: &DbPool, app_handle: &AppHandle) {
    let event_type = match event.kind {
        EventKind::Create(_) => "file_created",
        EventKind::Modify(_) => "file_modified",
        EventKind::Remove(_) => "file_deleted",
        _ => return,
    };

    for path in &event.paths {
        // 只处理文件，跳过目录
        if path.is_dir() {
            continue;
        }

        let path_str = path.to_string_lossy().to_string();

        info!(
            "[watcher] 文件变更: type={}, path={}",
            event_type, path_str
        );

        if let Ok(conn) = pool.get() {
            // 尝试找到对应的 deployment + skill_id + relative_path
            if let Some((dep_id, skill_id, rel_path)) =
                resolve_skill_for_file(pool, &path_str)
            {
                // ── 回写到 DB skill_files ──
                let mut write_succeeded = false;
                match event_type {
                    "file_deleted" => {
                        let _ = db_delete_file(&conn, &skill_id, &rel_path);
                        let _ = refresh_skill_checksum(&conn, &skill_id);
                        write_succeeded = true;
                        info!(
                            "[watcher] 已从 DB 删除文件: skill={}, path={}",
                            skill_id, rel_path
                        );
                    }
                    "file_created" | "file_modified" => {
                        if let Ok(content) = std::fs::read(path) {
                            if let Err(e) = db_write_file(&conn, &skill_id, &rel_path, &content) {
                                info!("[watcher] 回写 DB 失败: {} — {}", rel_path, e);
                            } else {
                                let _ = refresh_skill_checksum(&conn, &skill_id);
                                write_succeeded = true;
                                info!(
                                    "[watcher] 已回写到 DB: skill={}, path={}",
                                    skill_id, rel_path
                                );
                            }
                        }
                    }
                    _ => {}
                }

                // ── 同步更新 skill_deployments.checksum 和 status ──
                // 回写成功后，计算部署目录的最新 checksum 并更新记录，
                // 避免下次 reconcile 误报 diverged
                if write_succeeded {
                    if let Ok(deploy_path) = conn.query_row(
                        "SELECT path FROM skill_deployments WHERE id = ?1",
                        params![dep_id],
                        |row| row.get::<_, String>(0),
                    ) {
                        let new_dir_checksum = compute_dir_checksum(Path::new(&deploy_path));
                        let _ = conn.execute(
                            "UPDATE skill_deployments
                             SET checksum = ?1, status = 'synced',
                                 last_synced = datetime('now'), updated_at = datetime('now')
                             WHERE id = ?2",
                            params![new_dir_checksum, dep_id],
                        );
                        info!(
                            "[watcher] 已更新部署记录: dep={}, checksum={:?}",
                            dep_id, new_dir_checksum
                        );
                    }
                }

                // ── 记录 change_event ──
                let old_checksum: Option<String> = conn
                    .query_row(
                        "SELECT checksum FROM skill_deployments WHERE id = ?1",
                        params![dep_id],
                        |row| row.get(0),
                    )
                    .ok()
                    .flatten();

                let event_id = Uuid::new_v4().to_string();
                let _ = conn.execute(
                    "INSERT INTO change_events (id, deployment_id, event_type, old_checksum, new_checksum, resolution)
                     VALUES (?1, ?2, ?3, ?4, NULL, 'lib_updated')",
                    params![event_id, dep_id, event_type, old_checksum],
                );

                let _ = app_handle.emit("skill-change", serde_json::json!({
                    "event_id": event_id,
                    "event_type": event_type,
                    "path": path_str,
                    "deployment_id": dep_id,
                    "skill_id": skill_id,
                    "rel_path": rel_path,
                }));
            } else {
                // 无法匹配到已知部署，仍记录事件（状态 pending）
                let event_id = Uuid::new_v4().to_string();
                let dep_id = path_str.clone();
                let _ = conn.execute(
                    "INSERT INTO change_events (id, deployment_id, event_type, old_checksum, new_checksum, resolution)
                     VALUES (?1, ?2, ?3, NULL, NULL, 'pending')",
                    params![event_id, dep_id, event_type],
                );
                let _ = app_handle.emit("skill-change", serde_json::json!({
                    "event_id": event_id,
                    "event_type": event_type,
                    "path": path_str,
                    "deployment_id": dep_id,
                }));
            }
        }
    }
}

/// 启动文件系统监听，返回 watcher 实例（需保持存活）
pub fn start_file_watcher(pool: DbPool, app_handle: AppHandle) -> Option<RecommendedWatcher> {
    let watch_paths = collect_watch_paths(&pool);

    if watch_paths.is_empty() {
        info!("[watcher] 没有需要监听的目录");
        return None;
    }

    info!(
        "[watcher] 开始监听 {} 个目录: {:?}",
        watch_paths.len(),
        watch_paths
    );

    let (tx, rx) = mpsc::channel();

    let mut watcher = match RecommendedWatcher::new(
        move |result: Result<Event, notify::Error>| {
            if let Ok(event) = result {
                let _ = tx.send(event);
            }
        },
        Config::default().with_poll_interval(Duration::from_secs(2)),
    ) {
        Ok(w) => w,
        Err(e) => {
            log::error!("[watcher] 创建文件监听器失败: {}", e);
            return None;
        }
    };

    for path in &watch_paths {
        if let Err(e) = watcher.watch(path, RecursiveMode::Recursive) {
            log::warn!("[watcher] 监听目录失败: {} - {}", path.display(), e);
        }
    }

    // 后台线程处理事件
    std::thread::spawn(move || {
        info!("[watcher] 后台事件处理线程已启动");
        loop {
            match rx.recv_timeout(Duration::from_secs(5)) {
                Ok(event) => handle_fs_event(&event, &pool, &app_handle),
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    info!("[watcher] 通道已断开，停止监听");
                    break;
                }
            }
        }
    });

    Some(watcher)
}
