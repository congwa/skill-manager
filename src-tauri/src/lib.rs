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
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
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
            // Deployments
            commands::deployments::get_deployments,
            commands::deployments::get_skill_deployments,
            commands::deployments::create_deployment,
            commands::deployments::delete_deployment,
            commands::deployments::update_deployment_status,
            commands::deployments::get_diverged_deployments,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
