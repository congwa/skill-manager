mod commands;
mod db;
mod error;
mod models;

use db::pool;

pub fn run() {
    let db_path = pool::get_db_path();
    let db_pool = pool::create_pool(&db_path).expect("Failed to create database pool");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
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
