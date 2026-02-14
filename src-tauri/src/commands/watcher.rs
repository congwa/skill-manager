use log::info;
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use rusqlite::params;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;
use uuid::Uuid;
use tauri::AppHandle;
use tauri::Emitter;

use crate::db::DbPool;

const TOOL_SKILL_DIRS: &[&str] = &[
    ".windsurf/skills",
    ".cursor/skills",
    ".claude/skills",
    ".agents/skills",
    ".trae/skills",
];

/// 收集所有需要监听的目录
fn collect_watch_paths(pool: &DbPool) -> Vec<PathBuf> {
    let mut paths = Vec::new();

    // 1. Skill 库目录
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
                    for tool_dir in TOOL_SKILL_DIRS {
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

/// 处理文件变更事件，写入 change_events 表并 emit Tauri Event
fn handle_fs_event(event: &Event, pool: &DbPool, app_handle: &AppHandle) {
    let dominated_paths: Vec<String> = event
        .paths
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();

    let event_type = match event.kind {
        EventKind::Create(_) => "file_created",
        EventKind::Modify(_) => "file_modified",
        EventKind::Remove(_) => "file_deleted",
        _ => return,
    };

    info!(
        "[watcher] 文件变更: type={}, paths={:?}",
        event_type, dominated_paths
    );

    if let Ok(conn) = pool.get() {
        for path_str in &dominated_paths {
            // 查找与此路径相关的部署记录
            let deployment_id: Option<String> = conn
                .query_row(
                    "SELECT id FROM skill_deployments WHERE ?1 LIKE path || '%'",
                    params![path_str],
                    |row| row.get(0),
                )
                .ok();

            let dep_id = deployment_id.unwrap_or_else(|| path_str.clone());
            let event_id = Uuid::new_v4().to_string();

            let inserted = conn.execute(
                "INSERT INTO change_events (id, deployment_id, event_type, old_checksum, new_checksum, resolution)
                 VALUES (?1, ?2, ?3, NULL, NULL, 'pending')",
                params![event_id, dep_id, event_type],
            );

            if inserted.is_ok() {
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
