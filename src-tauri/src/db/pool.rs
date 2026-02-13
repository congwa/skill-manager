use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::OpenFlags;
use std::path::Path;

use crate::db::migrations;
use crate::error::AppError;

pub type DbPool = Pool<SqliteConnectionManager>;

pub fn create_pool(db_path: &Path) -> Result<DbPool, AppError> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let manager = SqliteConnectionManager::file(db_path)
        .with_flags(
            OpenFlags::SQLITE_OPEN_READ_WRITE
                | OpenFlags::SQLITE_OPEN_CREATE
                | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .with_init(|conn| {
            conn.execute_batch(
                "
                PRAGMA foreign_keys = ON;
                PRAGMA journal_mode = WAL;
                PRAGMA synchronous = NORMAL;
                PRAGMA busy_timeout = 5000;
                PRAGMA temp_store = MEMORY;
                PRAGMA cache_size = -64000;
                PRAGMA mmap_size = 30000000000;
                ",
            )
        });

    let pool = Pool::builder().max_size(8).min_idle(Some(2)).build(manager)?;

    {
        let conn = pool.get()?;
        migrations::run_migrations(&conn)?;
    }

    Ok(pool)
}

pub fn get_db_path() -> std::path::PathBuf {
    let home = dirs::home_dir().expect("Cannot find home directory");
    home.join(".skills-manager").join("db").join("skills.db")
}
