mod commands;
mod db;
mod error;
mod models;

use db::pool;
use log::info;
use tauri::Manager;

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
    let watcher_pool = db_pool.clone();
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
                // 将 watcher 存入 app state 以保持其存活
                app.manage(_watcher);
                info!("[启动] 文件系统监听已启动");
            } else {
                info!("[启动] 暂无需要监听的目录");
            }

            info!("[启动] Tauri 应用就绪");
            Ok(())
        })
        .manage(db_pool)
        .invoke_handler(tauri::generate_handler![
            // Projects
            commands::projects::get_projects,
            commands::projects::add_project,
            commands::projects::remove_project,
            commands::projects::get_project_deployments,
            commands::projects::get_dashboard_stats,
            // Skills
            commands::skills::get_skills,
            commands::skills::get_skill_by_id,
            commands::skills::create_skill,
            commands::skills::delete_skill,
            commands::skills::get_skill_source,
            commands::skills::get_skill_backups,
            commands::skills::read_skill_file,
            commands::skills::write_skill_file,
            commands::skills::list_skill_files,
            commands::skills::check_skill_updates,
            commands::skills::update_skill_from_library,
            commands::skills::restore_from_backup,
            // Deployments
            commands::deployments::get_deployments,
            commands::deployments::get_skill_deployments,
            commands::deployments::create_deployment,
            commands::deployments::delete_deployment,
            commands::deployments::update_deployment_status,
            commands::deployments::get_diverged_deployments,
            commands::deployments::deploy_skill_to_project,
            commands::deployments::sync_deployment,
            commands::deployments::check_deployment_consistency,
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
            // skills.sh
            commands::skillssh::search_skills_sh,
            commands::skillssh::get_skill_repo_tree,
            commands::skillssh::fetch_skill_content,
            commands::skillssh::install_from_skills_sh,
            commands::skillssh::check_remote_updates,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
