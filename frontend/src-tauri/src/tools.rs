/// Agent/工具配置中心
///
/// 每条记录描述一个支持 Skills 的 AI 编程工具：
///   - `id`          : 命令行 --agent 标识符，也是数据库 tool 字段的值
///   - `name`        : 显示名称
///   - `project_dir` : 项目级 Skills 目录（相对于项目根目录）
///   - `global_dir`  : 全局 Skills 目录（相对于 $HOME）
#[derive(Debug, Clone, Copy)]
pub struct ToolConfig {
    pub id: &'static str,
    pub name: &'static str,
    pub project_dir: &'static str,
    pub global_dir: &'static str,
}

pub const ALL_TOOLS: &[ToolConfig] = &[
    ToolConfig { id: "amp",           name: "Amp",             project_dir: ".agents/skills",      global_dir: ".config/agents/skills"        },
    ToolConfig { id: "antigravity",   name: "Antigravity",     project_dir: ".agent/skills",       global_dir: ".gemini/antigravity/skills"   },
    ToolConfig { id: "augment",       name: "Augment",         project_dir: ".augment/skills",     global_dir: ".augment/skills"              },
    ToolConfig { id: "claude-code",   name: "Claude Code",     project_dir: ".claude/skills",      global_dir: ".claude/skills"               },
    ToolConfig { id: "cline",         name: "Cline",           project_dir: ".cline/skills",       global_dir: ".cline/skills"                },
    ToolConfig { id: "codebuddy",     name: "CodeBuddy",       project_dir: ".codebuddy/skills",   global_dir: ".codebuddy/skills"            },
    ToolConfig { id: "codex",         name: "Codex",           project_dir: ".agents/skills",      global_dir: ".codex/skills"                },
    ToolConfig { id: "command-code",  name: "Command Code",    project_dir: ".commandcode/skills", global_dir: ".commandcode/skills"          },
    ToolConfig { id: "continue",      name: "Continue",        project_dir: ".continue/skills",    global_dir: ".continue/skills"             },
    ToolConfig { id: "cortex",        name: "Cortex Code",     project_dir: ".cortex/skills",      global_dir: ".snowflake/cortex/skills"     },
    ToolConfig { id: "crush",         name: "Crush",           project_dir: ".crush/skills",       global_dir: ".config/crush/skills"         },
    ToolConfig { id: "cursor",        name: "Cursor",          project_dir: ".agents/skills",      global_dir: ".cursor/skills"               },
    ToolConfig { id: "droid",         name: "Droid",           project_dir: ".factory/skills",     global_dir: ".factory/skills"              },
    ToolConfig { id: "gemini-cli",    name: "Gemini CLI",      project_dir: ".agents/skills",      global_dir: ".gemini/skills"               },
    ToolConfig { id: "github-copilot",name: "GitHub Copilot",  project_dir: ".agents/skills",      global_dir: ".copilot/skills"              },
    ToolConfig { id: "goose",         name: "Goose",           project_dir: ".goose/skills",       global_dir: ".config/goose/skills"         },
    ToolConfig { id: "iflow-cli",     name: "iFlow CLI",       project_dir: ".iflow/skills",       global_dir: ".iflow/skills"                },
    ToolConfig { id: "junie",         name: "Junie",           project_dir: ".junie/skills",       global_dir: ".junie/skills"                },
    ToolConfig { id: "kilo",          name: "Kilo Code",       project_dir: ".kilocode/skills",    global_dir: ".kilocode/skills"             },
    ToolConfig { id: "kimi-cli",      name: "Kimi Code CLI",   project_dir: ".agents/skills",      global_dir: ".config/agents/skills"        },
    ToolConfig { id: "kiro-cli",      name: "Kiro CLI",        project_dir: ".kiro/skills",        global_dir: ".kiro/skills"                 },
    ToolConfig { id: "kode",          name: "Kode",            project_dir: ".kode/skills",        global_dir: ".kode/skills"                 },
    ToolConfig { id: "mcpjam",        name: "MCPJam",          project_dir: ".mcpjam/skills",      global_dir: ".mcpjam/skills"               },
    ToolConfig { id: "mistral-vibe",  name: "Mistral Vibe",    project_dir: ".vibe/skills",        global_dir: ".vibe/skills"                 },
    ToolConfig { id: "mux",           name: "Mux",             project_dir: ".mux/skills",         global_dir: ".mux/skills"                  },
    ToolConfig { id: "openclaw",      name: "OpenClaw",        project_dir: "skills",              global_dir: ".openclaw/skills"             },
    ToolConfig { id: "opencode",      name: "OpenCode",        project_dir: ".agents/skills",      global_dir: ".config/opencode/skills"      },
    ToolConfig { id: "openhands",     name: "OpenHands",       project_dir: ".openhands/skills",   global_dir: ".openhands/skills"            },
    ToolConfig { id: "pi",            name: "Pi",              project_dir: ".pi/skills",          global_dir: ".pi/agent/skills"             },
    ToolConfig { id: "qoder",         name: "Qoder",           project_dir: ".qoder/skills",       global_dir: ".qoder/skills"                },
    ToolConfig { id: "qwen-code",     name: "Qwen Code",       project_dir: ".qwen/skills",        global_dir: ".qwen/skills"                 },
    ToolConfig { id: "replit",        name: "Replit",          project_dir: ".agents/skills",      global_dir: ".config/agents/skills"        },
    ToolConfig { id: "roo",           name: "Roo Code",        project_dir: ".roo/skills",         global_dir: ".roo/skills"                  },
    ToolConfig { id: "trae",          name: "Trae",            project_dir: ".trae/skills",        global_dir: ".trae/skills"                 },
    ToolConfig { id: "trae-cn",       name: "Trae CN",         project_dir: ".trae/skills",        global_dir: ".trae-cn/skills"              },
    ToolConfig { id: "universal",     name: "Universal",       project_dir: ".agents/skills",      global_dir: ".config/agents/skills"        },
    ToolConfig { id: "windsurf",      name: "Windsurf",        project_dir: ".windsurf/skills",    global_dir: ".codeium/windsurf/skills"     },
    ToolConfig { id: "zencoder",      name: "Zencoder",        project_dir: ".zencoder/skills",    global_dir: ".zencoder/skills"             },
    ToolConfig { id: "neovate",       name: "Neovate",         project_dir: ".neovate/skills",     global_dir: ".neovate/skills"              },
    ToolConfig { id: "pochi",         name: "Pochi",           project_dir: ".pochi/skills",       global_dir: ".pochi/skills"                },
    ToolConfig { id: "adal",          name: "AdaL",            project_dir: ".adal/skills",        global_dir: ".adal/skills"                 },
];

/// 根据工具 ID 获取配置
pub fn get_tool(id: &str) -> Option<&'static ToolConfig> {
    ALL_TOOLS.iter().find(|t| t.id == id)
}

/// 获取所有不重复的项目级目录（用于 watcher 监听和 reconcile 扫描）
pub fn unique_project_dirs() -> Vec<&'static str> {
    let mut dirs: Vec<&'static str> = ALL_TOOLS.iter().map(|t| t.project_dir).collect();
    dirs.dedup_by(|a, b| a == b);
    dirs.sort_unstable();
    dirs.dedup();
    dirs
}
