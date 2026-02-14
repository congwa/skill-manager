# PRD vs Rust 后端代码 — 功能差距分析报告

## 一、已实现的功能（8 个模块，44 个 Commands）

| 模块 | 文件 | 已注册 Commands |
|------|------|----------------|
| Projects | projects.rs | get_projects, add_project, remove_project, get_project_deployments, get_dashboard_stats |
| Skills | skills.rs | get_skills, get_skill_by_id, create_skill, delete_skill, get_skill_source, get_skill_backups, read_skill_file, write_skill_file, list_skill_files, check_skill_updates, update_skill_from_library, **restore_from_backup** |
| Deployments | deployments.rs | get_deployments, get_skill_deployments, create_deployment, delete_deployment, update_deployment_status, get_diverged_deployments, deploy_skill_to_project, sync_deployment, check_deployment_consistency, reconcile_all_deployments, **update_library_from_deployment** |
| Settings | settings.rs | get_all_settings, get_setting, set_setting, get_git_export_configs, save_git_export_config, delete_git_export_config, get_change_events, resolve_change_event, get_sync_history, get_app_init_status, initialize_app, reset_app |
| Scanner | scanner.rs | scan_project, scan_and_import_project, scan_global_skills |
| Git | git.rs | test_git_connection, export_skills_to_git, clone_git_repo, import_from_git_repo |
| skills.sh | skillssh.rs | search_skills_sh, get_skill_repo_tree, fetch_skill_content, install_from_skills_sh, check_remote_updates |
| Watcher | watcher.rs | start_file_watcher（内部启动，非 Command） |

## 二、未实现的功能（按优先级排序）

### 🔴 高优先级 — Phase 1/2 核心缺失

1. ~~**全局 Skill 目录路径错误（Bug）**~~ ✅ 已修复
   - scanner.rs GLOBAL_TOOL_DIRS 中 windsurf 路径已从 `.windsurf/skills` 改为 `.codeium/windsurf/skills`

2. ~~**缺少「从备份恢复」命令**~~ ✅ 已实现
   - 后端: skills.rs 新增 `restore_from_backup` 命令（回滚前自动备份当前版本、覆盖本地库、可选同步部署、写入 sync_history）
   - 前端: tauri-api.ts 新增 `restoreFromBackup` 接口，SkillDetail.tsx 备份历史 Tab "恢复此版本" 按钮已接入功能

3. ~~**缺少「从部署位置回写到本地 Skill 库」命令**~~ ✅ 已实现
   - 后端: deployments.rs 新增 `update_library_from_deployment` 命令（自动备份当前库版本、部署→库回写、可选同步其他部署、写入 sync_history）
   - 前端: tauri-api.ts 新增 `updateLibraryFromDeployment` 接口，SyncCenter.tsx 一致性报告偏离项新增"回写到库"按钮

4. ~~**缺少 Tauri Event 推送机制**~~ ✅ 已实现
   - 后端: watcher.rs handle_fs_event 中新增 `app_handle.emit("skill-change", ...)` 推送事件到前端
   - start_file_watcher 接收 AppHandle 参数，传递到后台线程
   - 前端: App.tsx 全局监听 `skill-change` 事件，自动刷新 changeEvents 和 deployments 数据，并弹出 toast 通知

5. ~~**部署时不检查目标目录冲突**~~ ✅ 已实现
   - 后端: deploy_skill_to_project 增加冲突检测，新增 `force` 参数和 `DeployConflict` 返回结构
   - 三种情况：目标不存在→直接部署、内容一致→跳过复制更新DB、内容不同→返回冲突信息不覆盖
   - 前端: SkillsStore.tsx 处理冲突响应，exists_same 提示已存在，exists_different 弹出"强制覆盖"确认

6. ~~**import_from_git_repo 不创建 skill_sources 记录**~~ ✅ 已修复
   - 后端: import_from_git_repo 新增 `source_url` 参数，导入新 Skill 和覆盖更新时均创建/更新 `skill_sources` 记录，自动推断 source_type（github/gitee/git）
   - 前端: tauri-api.ts 和 GitImport.tsx 传入用户输入的仓库 URL 作为 sourceUrl

7. ~~**install_from_skills_sh 不写入 sync_history**~~ ✅ 已修复
   - skillssh.rs 安装成功后新增 Step 6，写入 `sync_history` 记录（action='install', status='success'）

### 🟡 中优先级 — Phase 2/3 功能缺失

| # | PRD 章节 | 缺失功能 | 说明 |
|---|----------|----------|------|
| 8 | 3.5.6 | 选择性同步（按项目/按工具） | update_skill_from_library 只有 sync_deployments: bool，不支持筛选特定项目或工具 |
| 9 | 3.5.7 | Diff 计算命令 | 没有 compute_skill_diff 命令来计算两个 Skill 版本的差异，PRD 多处要求展示 Diff |
| 10 | 3.5.7 | 三向合并 | 没有合并功能，PRD 在冲突处理的多个场景中要求"打开合并编辑器" |
| 11 | 3.7.1 | Git 仓库更新检测 | 没有 check_git_repo_updates 命令（git fetch + 比对） |
| 12 | 3.3.1 | 排行榜 / 分类浏览 | search_skills_sh 只支持关键词搜索，没有排行榜和分类浏览 API |
| 13 | 3.2.1 | 按工具分组查询 | 没有 get_skills_by_tool 命令，PRD 要求按工具视图 |
| 14 | 3.5.7 | 批量删除处理 | 缺少"从所有位置删除"和"完全删除（含本地库）"的批量操作命令 |
| 15 | 3.6.2 | 变更事件关联 Skill 信息 | change_events 表只记录 deployment_id，前端需要额外查询才能展示 Skill 名称和项目 |
| 16 | 3.5.9 | 导出前一致性检查 | export_skills_to_git 不在导出前检查偏离状态 |
| 17 | 3.4.2 | 远程新增 Skill 自动导入 | 导出时执行 git pull，但不扫描远程新增的 Skill |

### 🟢 低优先级 — Phase 3/4 功能

| # | PRD 章节 | 缺失功能 |
|---|----------|----------|
| 18 | 3.2.3 | 打开外部编辑器（open_in_editor 命令） |
| 19 | 3.1.1 | 批量导入多个项目 |
| 20 | 3.1.1 | 拖拽项目目录快速导入（前端功能） |
| 21 | Phase 3 | 遗留规则格式导入转换（Cursor .mdc、Trae rules → SKILL.md） |
| 22 | 3.5.7 场景五 | Cursor 跨工具兼容扫描的特殊处理 |
| 23 | 3.5.7 场景六 | SKILL.md 相同但支撑文件不同时的逐文件 Diff |
| 24 | Phase 4 | Skill 编辑器（内置 Markdown 编辑 + 预览） |
| 25 | Phase 4 | Skill 创建向导 |
| 26 | Phase 4 | CLI 命令行工具 |
| 27 | Phase 4 | VS Code / JetBrains 插件集成 |

## 三、代码质量问题

| 文件 | 问题 | 严重程度 |
|------|------|----------|
| ~~scanner.rs:154~~ | ~~Windsurf 全局目录路径错误~~ ✅ 已修复 | ~~🔴 Bug~~ |
| ~~git.rs:540-598~~ | ~~import_from_git_repo 不创建 skill_sources~~ ✅ 已修复 | ~~🔴 数据不完整~~ |
| ~~skillssh.rs~~ | ~~install_from_skills_sh 不写 sync_history~~ ✅ 已修复 | ~~🟡 功能缺陷~~ |
| ~~watcher.rs:52-92~~ | ~~变更检测后不 emit Tauri Event~~ ✅ 已修复 | ~~🟡 功能缺陷~~ |
| ~~deployments.rs:248-251~~ | ~~部署时直接覆盖不检查冲突~~ ✅ 已修复 | ~~🟡 违反 PRD~~ |
| git.rs:159-164 | SQL 注入风险（format! 拼 SQL） | 🟢 安全建议 |
| settings.rs:155-170 | get_change_events 用 format! 拼 SQL | 🟡 SQL 注入风险 |

## 四、总结

| 维度 | 数量 |
|------|------|
| PRD 定义的功能模块 | 7 个大模块 |
| 已实现的 Tauri Commands | 44 个 |
| 🔴 高优 Bug/缺失 | 0 项（全部 7 项已修复） |
| 🟡 中优功能缺失 | 10 项 |
| 🟢 低优/Phase 4 | 10 项 |

**核心结论**: Phase 1 MVP 功能已基本完成。全部 7 项高优 Bug/缺失已修复，剩余为中低优先级 Phase 2/3/4 功能。当前剩余的主要工作是 Tauri Event 推送机制（中优）和 Diff/合并功能（Phase 2/3）。