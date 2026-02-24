mod commands;
mod db;
mod error;
mod models;
pub mod tools;

use db::pool;
use log::info;
use tauri::Manager;

/// 启动时一次性迁移：将存量 local_path 的文件内容导入 skill_files 表
/// 仅处理 skill_files 中没有记录但 local_path 有效的 Skill
fn migrate_legacy_local_paths(pool: &db::DbPool) {
    info!("[startup-migration] 开始检查存量 local_path 数据...");

    let conn = match pool.get() {
        Ok(c) => c,
        Err(e) => {
            log::warn!("[startup-migration] 获取 DB 连接失败: {}", e);
            return;
        }
    };

    // 查询有 local_path 但 skill_files 中没有文件的 Skill
    let skills: Vec<(String, String, String)> = {
        match conn.prepare(
            "SELECT s.id, s.name, s.local_path
             FROM skills s
             WHERE s.local_path IS NOT NULL AND s.local_path != ''
               AND NOT EXISTS (
                   SELECT 1 FROM skill_files sf WHERE sf.skill_id = s.id
               )"
        ) {
            Err(e) => {
                log::warn!("[startup-migration] 准备查询失败: {}", e);
                return;
            }
            Ok(mut stmt) => {
                match stmt.query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                }) {
                    Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
                    Err(e) => {
                        log::warn!("[startup-migration] 查询失败: {}", e);
                        return;
                    }
                }
            }
        }
    };

    if skills.is_empty() {
        info!("[startup-migration] 无需迁移（所有 Skill 已有 DB 文件或无 local_path）");
        return;
    }

    info!("[startup-migration] 发现 {} 个 Skill 需要迁移", skills.len());

    let mut migrated = 0usize;
    for (skill_id, name, local_path) in &skills {
        let dir = std::path::Path::new(local_path);
        if !dir.exists() || !dir.is_dir() {
            info!("[startup-migration] {} local_path 不存在，跳过: {}", name, local_path);

            // 尝试从部署目录补救
            let fallback: Option<String> = conn.query_row(
                "SELECT path FROM skill_deployments WHERE skill_id = ?1 AND path IS NOT NULL ORDER BY last_synced DESC LIMIT 1",
                rusqlite::params![skill_id],
                |row| row.get(0),
            ).ok();

            if let Some(dp) = fallback {
                let dp_path = std::path::Path::new(&dp);
                if dp_path.exists() {
                    info!("[startup-migration] {} 回退到 deploy_path: {}", name, dp);
                    match commands::skill_files::db_import_from_dir(&conn, skill_id, dp_path) {
                        Ok(n) => {
                            let cs = commands::skill_files::compute_db_checksum(&conn, skill_id);
                            let _ = conn.execute(
                                "UPDATE skills SET checksum = ?1 WHERE id = ?2",
                                rusqlite::params![cs, skill_id],
                            );
                            info!("[startup-migration] {} 从部署目录迁移了 {} 个文件", name, n);
                            migrated += 1;
                        }
                        Err(e) => info!("[startup-migration] {} 部署目录迁移失败: {}", name, e),
                    }
                }
            }
            continue;
        }

        match commands::skill_files::db_import_from_dir(&conn, skill_id, dir) {
            Ok(n) => {
                let cs = commands::skill_files::compute_db_checksum(&conn, skill_id);
                let _ = conn.execute(
                    "UPDATE skills SET checksum = ?1 WHERE id = ?2",
                    rusqlite::params![cs, skill_id],
                );
                info!("[startup-migration] 迁移 '{}': {} 个文件", name, n);
                migrated += 1;
            }
            Err(e) => {
                info!("[startup-migration] 迁移 '{}' 失败: {}", name, e);
            }
        }
    }

    info!("[startup-migration] 迁移完成: {} / {} 个 Skill", migrated, skills.len());
}

pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp_millis()
        .init();

    info!("=== Skills Manager 启动 ===");

    info!("[启动] 初始化数据库连接池...");
    let db_path = pool::get_db_path();
    info!("[启动] 数据库路径: {}", db_path.display());
    let db_pool = pool::create_pool(&db_path).expect("Failed to create database pool");
    info!("[启动] 数据库连接池创建成功");

    info!("[启动] 构建 Tauri 应用...");
    // 启动时一次性存量数据迁移（将老的 local_path 文件内容导入 skill_files 表）
    migrate_legacy_local_paths(&db_pool);

    let watcher_pool = db_pool.clone();
    let scan_pool = db_pool.clone();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(move |app| {
            info!("[启动] Tauri setup 钩子执行");
            #[cfg(debug_assertions)]
            {
                info!("[启动] Debug 模式：自动打开 DevTools");
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                    info!("[启动] DevTools 已打开");
                } else {
                    log::warn!("[启动] 未找到 main 窗口，无法打开 DevTools");
                }
            }

            // 启动文件系统监听
            info!("[启动] 启动文件系统监听...");
            let _watcher = commands::watcher::start_file_watcher(watcher_pool, app.handle().clone());
            if _watcher.is_some() {
                app.manage(_watcher);
                info!("[启动] 文件系统监听已启动");
            } else {
                info!("[启动] 暂无需要监听的目录");
            }

            // 后台自动扫描全局文件系统技能，将 CLI 安装的 Skill 同步入 SQLite
            info!("[启动] 启动后台文件系统扫描...");
            tauri::async_runtime::spawn(async move {
                match commands::scanner::scan_global_skills_internal(&scan_pool).await {
                    Ok(r) => info!(
                        "[启动] 自动扫描完成: {} 个 Skill 新入库, {} 个部署记录",
                        r.skills_imported, r.deployments_created
                    ),
                    Err(e) => log::warn!("[启动] 自动扫描失败: {}", e),
                }
            });

            info!("[启动] Tauri 应用就绪");
            Ok(())
        })
        .manage(db_pool)
        .invoke_handler(tauri::generate_handler![
            // Projects
            commands::projects::get_projects,
            commands::projects::add_project,
            commands::projects::batch_add_projects,
            commands::projects::remove_project,
            commands::projects::get_project_deployments,
            commands::projects::get_dashboard_stats,
            // Skills
            commands::skills::get_skills,
            commands::skills::get_skill_by_id,
            commands::skills::create_skill,
            commands::skills::delete_skill,
            commands::skills::batch_delete_skill,
            commands::skills::get_skill_source,
            commands::skills::get_skill_backups,
            commands::skills::read_skill_file,
            commands::skills::write_skill_file,
            commands::skills::list_skill_files,
            commands::skills::export_skill_to_local,
            commands::skills::open_skill_in_editor,
            commands::skills::check_skill_updates,
            commands::skills::update_skill_from_library,
            commands::skills::restore_from_backup,
            commands::skills::compute_skill_diff,
            commands::skills::merge_skill_versions,
            commands::skills::apply_merge_result,
            commands::skills::open_in_editor,
            // Deployments
            commands::deployments::get_deployments,
            commands::deployments::get_skill_deployments,
            commands::deployments::create_deployment,
            commands::deployments::delete_deployment,
            commands::deployments::update_deployment_status,
            commands::deployments::get_diverged_deployments,
            commands::deployments::deploy_skill_to_project,
            commands::deployments::deploy_skill_global,
            commands::deployments::sync_deployment,
            commands::deployments::check_deployment_consistency,
            commands::deployments::get_skills_by_tool,
            commands::deployments::reconcile_all_deployments,
            commands::deployments::update_library_from_deployment,
            // Settings
            commands::settings::get_all_settings,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::settings::get_git_export_configs,
            commands::settings::save_git_export_config,
            commands::settings::delete_git_export_config,
            commands::settings::get_change_events,
            commands::settings::resolve_change_event,
            commands::settings::get_sync_history,
            commands::settings::get_app_init_status,
            commands::settings::initialize_app,
            commands::settings::reset_app,
            // Scanner
            commands::scanner::scan_project,
            commands::scanner::scan_and_import_project,
            commands::scanner::scan_global_skills,
            // Git
            commands::git::test_git_connection,
            commands::git::export_skills_to_git,
            commands::git::clone_git_repo,
            commands::git::import_from_git_repo,
            commands::git::check_git_repo_updates,
            commands::git::scan_remote_new_skills,
            // skills.sh
            commands::skillssh::search_skills_sh,
            commands::skillssh::get_skill_repo_tree,
            commands::skillssh::fetch_skill_content,
            commands::skillssh::fetch_skill_readme,
            commands::skillssh::install_from_skills_sh,
            commands::skillssh::check_remote_updates,
            commands::skillssh::browse_popular_skills_sh,
            commands::skillssh::get_skill_categories,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
