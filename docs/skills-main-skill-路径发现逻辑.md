# skills-main：Skill 路径发现与命令逆推逻辑

本文档说明 skills-main（Skills CLI）如何确定某个 skill 在 GitHub 仓库中的路径，以及从安装命令 `npx skills add owner/repo@skill-name` 逆推出的完整执行逻辑。便于在未 clone 仓库的情况下复现「按名称找路径」或对接 skills.sh 等前端。

---

## 一、结论摘要

- **路径不是从 `@skill-name` 算出来的**，而是：clone 仓库 → 在约定目录下扫描所有含 `SKILL.md` 的目录 → 用 frontmatter 的 `name` 匹配 `@` 后面的名称 → 被选中的那个目录即为该 skill 的路径。
- 从命令能逆推出的是**整套发现与过滤流程**；**唯一确定的仓库内路径**无法仅从命令字符串得到，必须执行发现逻辑（或等价地调用 GitHub API + 解析 SKILL.md）才能得到。

---

## 二、用户输入如何解析为「路径 / 过滤」

解析逻辑在 `skills-main/src/source-parser.ts` 的 `parseSource(input)`。

### 2.1 支持的格式

| 输入形式 | 解析结果 | 说明 |
|----------|----------|------|
| `owner/repo@skill-name` | `type: 'github'`, `url`, `skillFilter: 'skill-name'` | **无 subpath**，从仓库根发现 |
| `owner/repo/path/to/skill` | `type: 'github'`, `url`, `subpath: 'path/to/skill'` | 从该子目录开始发现 |
| `https://github.com/owner/repo/tree/branch/path` | `type: 'github'`, `url`, `ref`, `subpath` | 显式分支与路径 |

### 2.2 `@skill-name` 的正则解析

```ts
// source-parser.ts
const atSkillMatch = input.match(/^([^/]+)\/([^/@]+)@(.+)$/);
if (atSkillMatch && ...) {
  const [, owner, repo, skillFilter] = atSkillMatch;
  return {
    type: 'github',
    url: `https://github.com/${owner}/${repo}.git`,
    skillFilter,  // 例如 "vercel-react-best-practices"
  };
}
```

- 得到：`owner`、`repo`、`skillFilter`。
- **没有 subpath**，因此不会限定「从仓库某子目录开始找」。

---

## 三、仓库内路径是如何被「发现」的

发现逻辑在 `skills-main/src/skills.ts` 的 `discoverSkills(basePath, subpath?, options?)`。

### 3.1 搜索起点

- `searchPath = subpath ? join(basePath, subpath) : basePath`
- 对 `owner/repo@skill-name`，`subpath` 为 `undefined`，即从**仓库根**开始。

### 3.2 发现顺序

1. **当前目录是否就是 skill**  
   若 `searchPath` 下存在 `SKILL.md`，则视为一个 skill，`skill.path = searchPath`。  
   除非传入 `fullDepth`，否则找到即返回，不再往下扫。

2. **约定目录（优先级列表）**  
   在 `searchPath` 下依次检查以下目录的**直接子目录**（只一层），若某子目录内存在 `SKILL.md`，则该子目录为一个 skill：
   - `searchPath`（根）
   - `searchPath/skills`、`skills/.curated`、`skills/.experimental`、`skills/.system`
   - `.agent/skills`、`.agents/skills`、`.claude/skills`、`.cline/skills`、`.codebuddy/skills`、`.codex/skills`、`.commandcode/skills`、`.continue/skills`
   - `.github/skills`、`.goose/skills`、`.iflow/skills`、`.junie/skills`、`.kilocode/skills`、`.kiro/skills`、`.mux/skills`、`.neovate/skills`、`.opencode/skills`、`.openhands/skills`、`.pi/skills`、`.qoder/skills`、`.roo/skills`、`.trae/skills`、`.windsurf/skills`、`.zencoder/skills`
   - 以及由 `getPluginSkillPaths(searchPath)` 从插件 manifest 中声明的路径。

3. **兜底：递归搜索**  
   若上述未找到任何 skill，或传入了 `fullDepth`，则通过 `findSkillDirs(searchPath)` 在 `searchPath` 下递归查找（跳过 `node_modules`、`.git` 等），深度受限，凡含有 `SKILL.md` 的目录都视为一个 skill。

### 3.3 Skill 的路径与名称

- 每个 skill 的 **路径**：包含 `SKILL.md` 的**目录**的绝对路径（即 `skill.path`）。
- **名称**：来自 `SKILL.md` 的 frontmatter `name`（必填），用于与 `@skill-name` 或 `--skill` 过滤匹配。

---

## 四、从命令逆推出的完整执行流程

以 **`npx skills add vercel-labs/agent-skills@vercel-react-best-practices`** 为例。

### 4.1 命令拆解

| 部分 | 含义 |
|------|------|
| `vercel-labs/agent-skills` | GitHub 仓库：owner/repo |
| `@vercel-react-best-practices` | 要安装的 skill 的「名称」（用于过滤） |

### 4.2 步骤 1：解析来源

- 正则匹配 `owner/repo@skill-name`。
- 得到：`url = https://github.com/vercel-labs/agent-skills.git`，`skillFilter = vercel-react-best-practices`，**无 subpath**。

### 4.3 步骤 2：Clone 仓库

- 将上述 URL 克隆到临时目录 `skillsDir`（仓库根）。

### 4.4 步骤 3：合并 skill 过滤条件

- 将 `parsed.skillFilter` 并入 `options.skill`，即 `['vercel-react-best-practices']`。

### 4.5 步骤 4：发现所有 skill

- 调用 `discoverSkills(skillsDir, undefined, { includeInternal, fullDepth })`。
- 从仓库根按「约定目录 + 递归」扫描，得到所有 `Skill { name, path, description, ... }`。
- **路径在此步确定**：每个 skill 的 `path` 是包含其 `SKILL.md` 的目录，不是由 `@vercel-react-best-practices` 推导出来的。

### 4.6 步骤 5：按名称过滤

- `filterSkills(skills, ['vercel-react-best-practices'])`。
- 匹配规则：frontmatter 的 `name` 或 `getSkillDisplayName(skill)`（即 `name || basename(path)`）与 `vercel-react-best-practices` **忽略大小写、完全相等**。

### 4.7 步骤 6：得到仓库内路径

- 过滤后选中的 skill 的 `path`，相对仓库根即为「该 skill 在 GitHub 下的路径」。
- 写入锁文件时记为相对 repo 根的 `SKILL.md` 路径，例如 `skills/vercel-react-best-practices/SKILL.md`。

---

## 五、与 skills.sh 的关系

- **skills.sh**：目录网站，提供搜索、排行榜、技能详情页；URL 形式为 `https://skills.sh/owner/repo/skill-name`。
- **skills-main**：CLI 源码，不是 skills.sh 的前端实现。
- skills.sh 的搜索 API（如 `GET /api/search?q=...`）返回 `id`、`name`、`source`、`installs` 等，**不包含**「仓库内路径」。
- 因此：从 skills.sh 只能得到 **owner/repo** 和 **skill 名称**；要得到「在 GitHub 下的具体路径」，需要：
  - 安装后查看 `~/.agents/.skill-lock.json` 中的 `skillPath`，或
  - 按本文档第三节的发现逻辑在仓库中查找（或等价地用 GitHub API 列树 + 读 SKILL.md frontmatter）。

---

## 六、不 clone 时如何复现路径

若要在不执行 `skills add` 的前提下得到「某 repo 下名为 X 的 skill 的路径」，需要复现同一套发现逻辑：

1. 使用 GitHub API 获取仓库文件树（如 `GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1`）。
2. 在树中筛选可能为 skill 的路径：符合约定目录结构，且存在 `SKILL.md`（例如路径以 `/SKILL.md` 结尾或目录在约定列表中）。
3. 对候选路径获取 `SKILL.md` 内容（如 raw 或 Contents API），解析 frontmatter 的 `name`。
4. 若 `name` 与目标 skill 名称（忽略大小写）一致，则该目录即为该 skill 在仓库中的路径。

这样得到的路径与 CLI 执行 `npx skills add owner/repo@skill-name` 后锁文件中的 `skillPath` 一致（同一仓库、同一分支下）。

---

## 七、相关源码索引（skills-main）

| 功能 | 文件 |
|------|------|
| 来源解析（owner/repo@skill-name） | `src/source-parser.ts` |
| 发现 skill（约定目录 + 递归） | `src/skills.ts`：`discoverSkills`、`findSkillDirs`、`hasSkillMd`、`parseSkillMd` |
| 按名称过滤 | `src/skills.ts`：`filterSkills`、`getSkillDisplayName` |
| add 主流程（clone → discover → filter → 安装与锁文件） | `src/add.ts` |
| 锁文件中 skill 路径（skillPath） | `src/skill-lock.ts`、`src/add.ts`（skillFiles → skillPath） |
| 搜索 API（不包含路径） | `src/find.ts`（调用 skills.sh `/api/search`） |
