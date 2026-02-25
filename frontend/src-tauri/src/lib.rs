mod commands;
mod db;
mod error;
mod models;
pub mod tools;

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
            commands::skills::check_skill_updates,
            commands::skills::dismiss_watcher_change,
            commands::skills::discard_watcher_change,
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
            commands::settings::get_app_init_status,
            commands::settings::initialize_app,
            commands::settings::reset_app,
            commands::settings::open_devtools,
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
            // Catalog (dmgrok)
            commands::catalog::fetch_catalog,
            commands::catalog::search_catalog,
            commands::catalog::enrich_single_install,
            commands::catalog::enrich_batch_by_category,
            commands::catalog::install_from_catalog,
            commands::catalog::check_catalog_updates,
            // skills.sh 直连搜索与安装
            commands::catalog::search_skills_sh,
            commands::catalog::install_from_skills_sh,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
