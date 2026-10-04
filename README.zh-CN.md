<p align="right"><a href="README.md">English</a> | <b>简体中文</b></p>

# Kora

**一个替小型培训机构做行政工作的 AI Agent,而且没有你的确认,绝不改动你的数据。**

Kora 是面向小型培训机构(一对一、小班)的教学协作平台。老师和学生用自然语言和 AI Agent 对话:点名、改课时间、出 quiz、按老师自己的笔记讲解知识点。这个产品最核心的原则是"可信":**AI 不会自己写业务数据。** 老师所有的写操作都走 *AI 提案 → 老师确认 → service 函数*。

> Kora 原名 EduSync,个别内部标识符(例如本地数据库名 `edusync`)仍沿用旧名字。

---

## 目录

1. [AI Agent 一览](#ai-agent-一览)
2. [工作原理](#工作原理)
3. [项目现状](#项目现状)
4. [功能](#功能)
5. [技术栈](#技术栈)
6. [快速开始](#快速开始)
7. [演示账号与种子数据](#演示账号与种子数据)
8. [架构](#架构)
9. [AI Agent](#ai-agent)
10. [权限隔离](#权限隔离)
11. [仓库结构](#仓库结构)
12. [分工、两条线与工作方式](#分工两条线与工作方式)
13. [开发路线](#开发路线)
14. [验收用例](#验收用例)
15. [文档索引](#文档索引)

---

## AI Agent 一览

Kora 的助手是一个**会用工具的 Agent**,不是贴在日历旁边的聊天框。它读取你的真实数据、准备修改、把将要发生的事完整展示出来,然后等人说"确认"。老师和学生各有自己的 Agent,按角色限定能力。

| 你说 | Agent 做什么 | 靠什么保证安全 |
|---|---|---|
| "Jordan 今天来上数学了,Sam 请假。" | 找到课时和名单,准备出勤记录和课时扣减 | 扣减由代码计算,你确认之前什么都不会写入 |
| "把周五的课挪到周六下午 4 点。" | 检查老师和每个选课学生的日程,预览新旧时间 | 有冲突就不生成提案,并说明和什么冲突 |
| 📷 *一张课表照片* + "把这些课加到我的日历。" | 视觉模型读出照片,Agent 把它变成排课提案 | 照片里读出的文字只是数据,不是指令 |
| "给斜率出 8 道题:5 道选择,难度 3 易 3 中 2 难。" | 代码先规划题型和难度分布,受限的模型调用根据你的材料出题 | 只保留有原文逐字引用支撑的题目 |
| "根据我的数学材料生成教学笔记。" | 起草课程总结、知识点、常见错误和 FAQ | 同样要有依据;你审核之后才会保存 |
| "设计我的主页:今天的课、请求和 Jordan 的进度,用海洋配色。" | 选出组件,由代码把它们摆到网格上 | 每个学生和课程都会校验;你先预览 |
| (学生)"讲讲平衡法怎么用。" | 根据老师自己的笔记和课程材料一步步讲解 | 每条引用都和原文核对,核对不上就回答"我找不到" |
| (学生)"我下节课是什么时候?" | 读取该学生自己的日程 | 日期和时间由代码给出,不由模型推算 |

### 为什么可信

- **只提案,不直接写。** AI 能读、能提案。业务数据只有在人确认之后才会改,走的是和手动表单同一批带权限检查的 service 函数。
- **事实交给代码。** 扣减、出勤率、日期、时区、冲突和引用都由代码计算或核对,模型只负责理解意图和组织语言。
- **有依据才回答。** 资料问答带的引用由代码对着原文核对,原文里没有就说找不到。
- **不可信输入永远只是数据。** 学生消息、课程材料和照片里读出的文字,都改变不了会调用哪些工具、为谁调用。
- **按身份隔离。** 提问的人是谁只来自登录会话。老师只能看到自己的课程,学生只能看到自己的数据,学生的私人备注永远进不了学生的 Agent,每个对话只属于一个用户。
- **看得见。** 实时的 Agent 控制台会点亮请求经过的每一步和用到的文件,还有一个 "What the agents can do" 面板,用大白话列出所有工具,分成只读和"准备修改"两类。

### 怎么和它对话

- **一个弹窗,多个对话。** 在任何页面按 Ctrl/Cmd+K。随时开一个新对话,或者从历史列表里接着聊以前的。每个对话有自己的上下文,有等你决定的对话会标一个红点。
- **每门课一个助手。** 每个课程页都有自己的助手,在代码里被锁定在这门课上,历史记录也独立。学生可以向课程助教提问,而全局助手保持通用。
- **老师可以发照片。** 可以附上、粘贴或拖入最多四张照片(课表、作业、白板)。照片只读取一次,不会保存。

**数字:** 30 个老师工具(17 个只读、13 个生成提案)和 7 个学生工具 · 12 种提案类型 · 模型与工具的循环最多 6 轮 · 23 个脚本共 640 项离线检查,另有真实数据库和真实模型的检查。

## 工作原理

```
老师:"今天数学班 Jordan 到了,Sam 请假"
   │
   ▼
① AI 通过只读服务函数读取数据
   │
   ▼
② AI 生成提案,存入 AgentProposal(状态 pending)
   │
   ▼
③ 页面显示预览("Jordan:到课,Sam:请假。确认吗?")
   此时业务数据没有任何变化。
   │  老师点击【确认】
   ▼
④ POST /api/ai/proposals/:id/confirm
      a. 原子地把状态 pending → confirmed(同一时刻只有一个请求能成功)
      b. 用 Zod 校验内容
      c. 调用服务函数,例如 confirmAttendance(actor, {...})
   │
   ▼
⑤ 服务函数检查权限,写入出勤和扣课记录
   │
   ▼
⑥ 提案变成 executed(失败则变成 failed,错误展示给老师)
```

要点:

- AI 只能**读**和**出提案**,碰不到业务表。
- 服务函数完全不知道 AI 和提案的存在,所以手动表单也能调用同一批函数。
- 连点两次确认也不会写两次:唯一约束加原子状态更新,保证最多执行一次。

## 项目现状

工作由两位负责人分担(见[分工、两条线与工作方式](#分工两条线与工作方式))。

| 模块 | 状态 |
|---|---|
| Next.js 骨架、Docker Compose、PostgreSQL | 已完成 |
| Prisma schema(20 张表)和迁移 | 已完成 |
| 演示账号种子(幂等,生产环境拒绝运行) | 已完成 |
| 邮箱密码登录、按角色保护路由、`requireActor()` | 已完成 |
| 只读服务(`src/services/read.ts`):课程、课表、学生、资料、学生工作区 | 已完成 |
| 老师课表页(本周 / 下周) | 已完成 |
| 学生页(我的课程和未来 30 天的场次) | 已完成 |
| 老师课程管理、学生加入、排课、点名和扣课 | 已完成 |
| 课程单元和资料(老师编辑,学生阅读) | 已完成 |
| 场次改期(老师界面、冲突检查、变更记录) | 已完成 |
| 学生请假和换时间请求(学生表单、老师的请求收件箱、AI) | 已完成 |
| 学习进度记录(老师的进度标签页、学生的进度笔记、AI 起草) | 已完成 |
| 月历、老师的学生页和账号设置 | 已完成 |
| 可自定义的老师主页(9 种组件、拖拽缩放、6 套配色、动画风格、布局历史、AI 设计布局) | 已完成 |
| 课程资料文件上传(.txt、.md、.pdf、.docx;可预览、可删除) | 已完成;扫描版 PDF 需要先做 OCR |
| 根据资料由 AI 出 quiz(有原文依据的题目、草稿、发布、学生练习) | 已完成 |
| 教学知识库页面,以及依据老师笔记讲课的学生助教 | 已完成;与老师私有的学生记忆完全分开 |
| 按角色区分的 AI 面板、聊天接口、只读问答、带验证引用的资料问答、提案流程 | 已接入;要得到真实模型的回复,需要配置 AI 接口 |
| 完整的多人 AI 演示数据(`prisma/seed-ai.ts`) | 已完成;`npm run db:seed:demo`,或用 `npx tsx prisma/seed-ai.ts --reset` 从干净状态重来 |
| AI 提案和运行记录存进数据库(`AgentProposal`、`AgentRun`) | 已完成;只写 AI 自己的表 |
| AI 聊天做成居中弹窗并带历史,每个对话有独立上下文;每个课程页有自己的助手 | 已完成;对话按用户存储(`AgentConversation`、`AgentMessage`) |
| 课程、单元、资料、课时和选课关系都能修改和删除;教学知识页可以直接上传文件 | 已完成;删除课程需要输入课程名,并会列出一并删除的内容 |
| 老师可以在聊天里附上照片(课表、作业、白板) | 已完成;真正识图需要配置 `AI_VISION_MODEL`。照片里读出的文字按不可信数据处理,图片本身不会保存 |
| 带剧本的演示模型(`AI_MOCK=1`),不需要网络和 key,直接驱动真实工具 | 已完成 |
| 2026 年 11 月 1 日之后的温哥华日历行为 | 已按当前时区数据验证;不列颠哥伦比亚省全年保持 UTC-7 |

老师和学生的核心流程、持久化的 AI 提案、按角色区分的工具和演示数据都已实现。用真实语言模型做界面验收,仍需要在本地 `.env` 里配置 `AI_API_KEY` 和 `AI_MODEL`。

## 功能

每个 AI 功能都是同一个模式:老师说一句话,AI 读数据,出预览,老师确认,服务函数写入。A 档必做,B 档其次,C 档是加分项。

| # | 功能 | 老师怎么说(例) | 结果 | 档 / 状态 |
|---|---|---|---|---|
| 1 | 查课表、学生、出勤 | "我明天有哪些课?" | 只读工具可用;回答需要配置好的模型 | A · 已接入 |
| 2 | AI 点名 | "今天数学班 Jordan 到了,Sam 请假" | `MARK_ATTENDANCE` 预览,确认后写出勤和扣课 | A · 已接入;完整演示需要先导入演示数据 |
| 3 | 学生资料问答 | (学生)"第二章的定义是什么?" | 带校验引用的回答,没有就回答"暂时没有" | A · 已接入;带引用的回答需要先导入演示数据 |
| 4 | AI 建课程 | "新建周末数学小班,加 Jordan 和 Sam" | `CREATE_COURSE` 预览,确认后建课并加学生 | B · 已接入 |
| 5 | AI 排课 | "下周二四各排一节 60 分钟" | `CREATE_SESSIONS` 预览,逐节 ✅/❌;有冲突就不创建提案 | B · 已接入;已按当前温哥华时区规则验证 |
| 6 | AI 录入课程内容 | 粘贴一段文字:"建第一单元并加入" | `ADD_CONTENT` 预览,确认后建单元和资料 | B · 已接入;真实数据库和确认流程已验证 |
| 7 | 出勤趋势 | "Jordan 最近出勤怎么样?" | 数字由代码计算;少于 3 节课时回答 "Insufficient data to identify a trend." | B · 已接入;阈值和出勤率已验证 |
| 8 | 学生 memory | "记一下 Jordan 周二周四下午不方便" | `ADD_STUDENT_NOTE` 预览,确认后写入 `AgentMemory`(仅老师可见) | C · 已接入;角色和课程隔离已验证 |
| `ADD_STUDENT`(v0.6) | `AddStudentInput` | `addExistingStudentToCourse` |
| 9 | 基于 memory 排课 | "给数学班排下周的课" | 同 #5,候选时间避开已记录的不方便时段 | C · 已接入;有冲突的偏好会阻止创建提案 |
| 10 | 备课 | "帮我备明天数学班的课" | `ADD_CONTENT` 预览,含讲义草稿和 5 道练习 | C · 已接入;5 道题的输出经过校验,需要确认 |
| 11 | 改期 | "把 10/10 的课改到 10/11 下午 4 点" | `RESCHEDULE` 预览,显示原时间和新时间;冲突会拦下提案;不改变扣课 | C · 已接入(手动也可以) |
| 12 | 学生请假请求 | (学生)"下周二我想请假" | `STUDENT_REQUEST` 预览;学生确认后变成给老师的待处理请求,课表和出勤不变 | C · 已接入 |
| 13 | 学习进度记录 | "记录 Jordan 的进度:目标:分数;成果:10 题对 8 题;下一步:练习" | 按老师自己的话生成 `PROGRESS_RECORD` 预览;学生之后能看到(看不到老师私人备注) | C · 已接入 |
| 14 | 把学生加进课程 | "把 Sam 加进我的物理课" | `ADD_STUDENT` 预览;姓名只在老师自己的学生里匹配 | C · 已接入 |
| 15 | 可自定义的主页 | "帮我设计主页:今天的课、待处理请求、Jordan 的进度,用海洋配色" | `DASHBOARD_LAYOUT` 预览(带缩略图);由代码排版,并校验每个学生和课程;布局存入历史(老师也可以手动拖拽、缩放、选配色) | C · 已接入 |
| 16 | 课程文件 | 把 PDF、Word、.txt 或 .md 拖到某个单元上 | 服务器提取文字并存成普通文字材料(长文件自动分成编号的几份),学生问答和引用照常工作 | C · 已接入(扫描版 PDF 没有 OCR) |
| 17 | AI 出 quiz | "给我的数学课出 8 道题:5 道选择、2 道判断、1 道简答;3 易 3 中 2 难;涵盖斜率" | `QUIZ` 预览。题型和难度的配比由代码计划;单独一步写题;代码只保留答案能在材料里找到原文引用的题。保存为草稿,老师发布后学生可练习 | C · 已接入 |
| 18 | 教学知识库与学生助教 | (老师)"根据我数学课的材料生成教学笔记";(学生)"讲讲平衡法怎么用" | `KNOWLEDGE` 预览,保存后成为学生助教讲课的依据;学生得到分步骤的讲解和经过代码核对的引用,没覆盖到的话题会老实说"老师还没讲到"。与老师私有的学生记忆完全分开 | C · 已接入 |
| 19 | 带历史的对话 | 按 Ctrl/Cmd+K,开新对话,或从列表里接着聊 | 居中弹窗;每个对话有自己的上下文;有待决定内容的对话会标红点 | C · 已集成 |
| 20 | 课程助手 | 打开课程,问"我们上周讲了什么?"(老师)或"讲讲这个单元"(学生) | 在代码里锁定在这门课上的助手,历史记录独立 | C · 已集成 |
| 21 | 聊天里的照片 | (老师)附上课表照片:"把这些课加到我的日历" | 视觉模型读出照片,Agent 生成提案;读出的文字按不可信数据处理,图片本身不保存 | C · 已集成;真正识图需要配置 `AI_VISION_MODEL` |
| 22 | 课程管理 | 修改或删除课程、单元、资料、课时;移出学生;在教学知识页直接上传文件 | 老师手动表单;删除课程需要输入课程名,并列出会一并删除的内容 | C · 已集成(暂时不是 AI 提案) |
| 23 | Quiz 成绩 | (学生)做已发布的 quiz;(老师)"斜率那个 quiz 同学们考得怎么样?" | 代码给选择题和判断题判分并保存每次作答;学生能看到自己上次的成绩,老师在 Quizzes 标签页或问助手时能看到每个学生的最近和最好成绩、平均分、谁还没做、错得最多的题 | C · 已集成 |
| 24 | 学费增减 | "给 Jordan 加 3 次课" | 不在当前 MVP 内;需要先在契约里约定新表、新函数和新提案类型 | C · 不在范围内 |

**最少要演示的一条线:** 功能 1 → 2 → 3 → 权限隔离,在演示数据上进行。可以用真实模型(`AI_API_KEY`、`AI_MODEL`)运行;没有网络和 key 时,用带剧本的演示模式(`AI_MOCK=1`),它能理解几类简单的话,并驱动同样的真实工具、提案、确认和数据库(它不是语言模型,所以展示不了真实模型是怎么选工具的)。

手动表单可以用来建课、加学生、排课、点名、管理资料和改期,所以不用 AI 核心流程也能用。

## 技术栈

- **前后端:** Next.js(App Router)、React、严格模式 TypeScript
- **界面:** Tailwind CSS、shadcn/ui
- **数据库:** PostgreSQL 17 + Prisma 6
- **登录:** Auth.js(next-auth v5 beta),邮箱 + 密码,JWT 会话
- **校验:** Zod
- **主页网格:** `react-grid-layout`(拖拽和缩放)
- **读文件:** `unpdf`(PDF)和 `mammoth`(Word),只在服务器上运行
- **AI:** 任意 OpenAI 兼容的 chat-completions 接口(默认 DeepSeek),用原生 `fetch` 调用,不装 `openai` 包;`AI_MOCK=1` 时运行带剧本的演示模型,用于离线演示
- **运行:** Docker Compose,本地运行在 `http://localhost:3000`,不需要线上部署

> 本项目用的 Next.js 版本有破坏性变更。写 Next.js 代码前,先读 `node_modules/next/dist/docs/` 里对应的文档(见 `CLAUDE.md`)。

## 快速开始

前提:已安装并启动 Docker Desktop、Git,可选 Node 22 和 VS Code。

```bash
git clone https://github.com/ZacahryZhou/Kora.git
cd Kora
cp .env.example .env        # 然后按下面的说明修改
docker compose up --build   # 应用在 http://localhost:3000,数据库在 :5432
```

在另一个终端里创建演示账号:

```bash
docker compose exec app npm run db:seed
```

打开 <http://localhost:3000>,用[演示账号](#演示账号与种子数据)登录。

容器启动时会自动运行 `prisma generate` 和 `prisma migrate deploy`,所以表结构会自动建好。如果 `package-lock.json` 比已装的依赖新(比如你拉了新依赖),它还会先运行 `npm install`。拉取新代码后的第一次启动可能要 1–3 分钟:等日志里出现 `✓ Ready` 再打开页面。

然后创建 AI 演示数据(两位老师、三位学生、三门课、资料、出勤,以及一套模拟的老师知识库):

```bash
docker compose exec app npm run db:seed:demo
```

### 拉取新代码之后

```bash
git pull origin main
docker compose up --build --renew-anon-volumes
```

`--renew-anon-volumes` 会重建 Compose 在两次运行之间保留的 `node_modules` 卷,这样拉取新代码时新增的依赖才会生效。它**不会**动数据库。新的数据库迁移会在启动时自动应用。

### 常见问题

| 你看到的 | 原因 | 怎么办 |
|---|---|---|
| `Module not found: Can't resolve 'react-grid-layout'`(或 `unpdf`、`mammoth`) | 旧的 `node_modules` 卷盖住了重新构建的镜像里的包 | `docker compose down`,再 `docker compose up --build --renew-anon-volumes` |
| 浏览器显示 `localhost refused to connect`(`ERR_CONNECTION_REFUSED`) | app 容器还没启动,或已经停了 | 运行 `docker compose ps` 和 `docker compose logs --tail=80 app`;等到 `✓ Ready`;如果容器已退出,看日志里的错误 |
| `docker compose up` 以 `context canceled` 结束 | 镜像构建完之后命令被中断(按了 Ctrl+C,或 Docker Desktop 暂停) | 再运行一次 `docker compose up`(不需要 `--build`) |
| 自己启动的开发服务器里出现 `Cannot read properties of undefined (reading 'findUnique')` | 服务器在 `prisma generate` 加入新表之前就加载了 Prisma 客户端 | 每次 `prisma generate` 之后都要重启开发服务器 |
| 重启后演示账号或数据不见了 | 数据库卷被清空了(`down -v`),或者从没导入过种子 | 运行上面的两条种子命令 |
| `git status` 里 `.env.example` 显示被修改 | 你在本地改了模板 | 真实的值只放在 `.env`,绝不要提交真实密钥;用 `git checkout .env.example` 还原模板 |

除非你想清空数据库,否则不要用 `docker compose down -v`。

### 环境变量

真实值只放本地 `.env`(已被 git 忽略)。`.env.example` 里只有占位值。**绝不要提交 `.env` 或任何密钥,这个仓库是公开的。**

| 变量 | 作用 |
|---|---|
| `DATABASE_URL` | PostgreSQL 连接串(Compose 会为应用容器覆盖它) |
| `AUTH_SECRET` | Auth.js 签名密钥,把 `change-me` 换成随机值 |
| `AUTH_URL` | 应用的公开地址,`http://localhost:3000` |
| `APP_TZ` | 显示和解读时间用的时区,默认 `America/Vancouver` |
| `AI_BASE_URL` | OpenAI 兼容接口地址,默认 `https://api.deepseek.com` |
| `AI_API_KEY` | 模型 API Key(只放本地) |
| `AI_MODEL` | 模型名,例如 `deepseek-chat` |
| `AI_ADMIN_EMAILS` | 生产环境下允许打开 Agent 控制台的邮箱(逗号分隔;开发环境任何老师都可以) |
| `AI_MOCK` | 设为 `1` 时用带剧本的演示模型代替真实模型(不需要网络和 key),但仍然使用真实工具和数据库 |
| `AI_VISION_MODEL` | 可选。读取老师在聊天里附上的照片所用的视觉模型(例如 `gpt-4o-mini`)。DeepSeek 的聊天模型看不了图片,所以要单独配置;没配置时,附上照片会提示该设置什么 |
| `AI_VISION_BASE_URL`、`AI_VISION_API_KEY` | 可选。视觉模型的接口地址和 key,默认沿用 `AI_BASE_URL` 和 `AI_API_KEY`;只有视觉模型在另一个服务商时才需要设置 |

### 常用命令

```bash
docker compose up --build            # 启动
docker compose up --build --renew-anon-volumes   # 拉取新依赖之后启动(保留数据库)
docker compose down                  # 停止(保留数据库)
docker compose down -v               # 停止并清空数据库(数据会丢!)
docker compose logs -f app           # 查看应用日志
docker compose exec app npm run db:seed   # 创建演示账号(幂等)
docker compose exec app npx tsx prisma/seed-ai.ts --reset   # 从干净状态导入 AI 演示数据
docker compose exec app npm run db:reset-real -- --yes   # 删除所有课程和学生(保留老师账号),再建你自己的课程和两个学生(不加 --yes 只预览;可选 --students a@x,b@x --course 课程名 --subject 科目)
docker compose exec app npm run db:add-students                  # 新增学生账号 1@student.text 和 2@student.text,不删除任何数据(加 --course <课程名> 可顺便选课)
npx tsx src/lib/ai/dev/run-all.ts    # 运行全部离线 AI 检查,输出一份汇总
docker compose exec app npm run check:live   # 用真实模型跑测试清单(用你自己的 AI key,约 60 次调用);加 -- --list 只预览
npm run typecheck                    # 类型检查
npm run lint                         # 代码检查
npm run check:ai                     # 和 run-all.ts 一样的离线 AI 检查
docker compose exec app npm run db:migrate   # 手动应用数据库迁移(启动时也会自动做)
```

基础种子只创建两个账号。再运行一步 AI 演示数据,才会创建多人的课程、出勤、资料、冲突场次和老师私有的 memory。

### 干净环境检查

`docker compose down -v` → `docker compose up --build` → `docker compose exec app npm run db:seed` → `docker compose exec app npm run db:seed:demo` → 登录。

不需要真实 AI key 就能运行全部离线 AI 检查(假服务、不用 key):`npx tsx src/lib/ai/dev/run-all.ts`,或者更短的 `npm run check:ai`。真实数据库的验收检查,在应用容器里运行 `NODE_ENV=development npx tsx src/lib/ai/dev/real-services-check.ts`。

### 测了什么

- **离线检查**(`npm run check:ai`):23 个脚本、640 项检查,不需要网络和 key,跑在内存里的假服务上。
- **真实数据库检查**(在 app 容器里运行 `NODE_ENV=development npx tsx src/lib/ai/dev/real-services-check.ts`):134 项,覆盖服务、权限、跨账号拒绝和确认路径。
- **真实模型检查**(`npm run check:live`):用你自己的接口 key 跑 20 个场景,输出 PASS、FAIL 或 REVIEW。
- 每个功能也都用两个或更多账号在浏览器里跑过(见 `docs/DEMO-SCRIPT.md`)。

## 演示账号与种子数据

`npm run db:seed` 只创建两个基础账号,没有课程。两个账号共用的演示密码只写在 `prisma/seed.ts` 里。重新运行种子时,会删除旧的种子账号(前提是这些账号没有关联数据)。

| 角色 | 姓名 | 邮箱 |
|---|---|---|
| 老师 | Demo Teacher | `t@example.test` |
| 学生 | Demo Student | `s@example.test` |

下面这些多人验收角色(Alex Morgan、Taylor Chen、Jordan Lee、Sam Patel、Casey Kim)和两个基础登录账号是分开的。`npm run db:seed:demo` 会用演示密码创建它们:

- **课程 A "Grade 8 Math Small Group"**(Alex;Jordan 和 Sam):两个单元,资料里有可验证的事实,并且故意**不含**二次函数顶点公式,用来测试"暂时没有"。
- **课程 B "Grade 8 Physics 1:1"**(Alex;Jordan):有一节与课程 A 下周二 16:00 重叠的场次,用来测试冲突检测。
- **课程 C "Grade 10 English 1:1"**(Taylor;Casey):用来证明 Alex 的 AI 查不到 Casey。
- 已完成的场次(带出勤和扣课),以及本周和下周的待上课场次。
- 一套模拟的**老师知识库**(给 Alex 的数学和物理共 12 条笔记,另加一条讲课风格,给 Taylor 一条笔记):课程摘要、知识点、例题、常见错误和 FAQ。学生能读到这些笔记,助教也依据它讲课。它与下面老师私有的 memory 是分开的。
- `AgentMemory` 示例:Jordan 周二周四下午不方便;Sam 在函数部分较弱。

基础账号种子和 AI 演示种子都是幂等的,`NODE_ENV=production` 时拒绝运行。五个 AI 角色的邮箱是 `t+alex@example.test`、`t+taylor@example.test`、`s+jordan@example.test`、`s+sam@example.test` 和 `s+casey@example.test`。

## 架构

```
浏览器
 ├─ 老师 / 学生页面(src/app/**)── 调用 ──▶ src/services/** ──▶ Prisma ──▶ PostgreSQL
 └─ AI 弹窗(Ctrl/Cmd+K)和每个课程页上的助手
      │ POST /api/ai/chat  { message, conversationId?, courseId?, images? }
      ▼
   聊天处理:身份来自会话 → 该对话最近 10 条消息(AgentConversation / AgentMessage)
            → 老师的照片由视觉模型读成不可信文字
   src/app/api/ai/chat → src/lib/ai/core/agent-loop(模型 ↔ 工具循环,最多 6 轮,有超时,仅服务端)
      ├─ 只读工具  ─▶ src/services/read.ts
      ├─ 提案工具  ─▶ 写 AgentProposal(pending) ─▶ 返回预览
      └─ 学生 memory ─▶ 读/写 AgentMemory(写入也走提案,仅老师)
   老师点确认 → POST /api/ai/proposals/:id/confirm
      → 原子 pending→confirmed → Zod 校验 → src/services/write.ts → executed / failed
```

所有服务函数的签名都是 `fn(actor, input) => Promise<Result<T>>`:

```ts
type Result<T> = { ok: true; data: T } | { ok: false; error: ServiceError };
type ErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "INTERNAL";
```

它们不会向调用方抛异常。身份(`actor`)只通过 `requireActor()` 从登录会话中读取;任何函数和路由都不接受前端或模型传来的用户 ID 或角色。

约定:ID 是 `cuid()` 字符串;时间是 ISO 8601 UTC 字符串,数据库存 `timestamptz`,界面按 `APP_TZ` 显示;金额是整数分;列表最多返回 200 条;枚举值全部大写英文。

## AI Agent

### 一个循环,两套配置

老师 Agent 和学生 Agent 是同一个循环,只是系统提示和工具集不同。学生没有写入工具;他们唯一能准备的提案是给自己老师的请假或换时间请求,而且仍然需要学生自己确认。

老师的只读工具(17 个):`getTeacherSchedule`、`listMyCourses`、`listMyStudents`、`listAttendance`、`listDeductions`、`checkConflicts`、`getCourseMaterials`、`getAttendanceTrends`、`getStudentMemory`、`getMyProfile`、`findMyStudent`、`listStudentRequests`、`listProgressRecords`、`listMyDashboardLayouts`、`listMyQuizzes`、`getQuizResults`、`listMyKnowledge`。老师只准备待确认提案的工具(13 个):`proposeMarkAttendance`、`proposeCreateCourse`、`proposeCreateSessions`、`proposeAddContent`、`proposeAddStudent`、`proposeReschedule`、`proposeProgressRecord`、`proposeAddStudentNote`、`proposeLessonPrep`、`proposeDashboardLayout`、`proposeQuiz`、`proposeKnowledge`、`proposeKnowledgeFromMaterials`。学生的工具(7 个):`getStudentWorkspace`、`answerFromCourseMaterials`、`explainWithTeacherNotes`、`getMyProfile`、`listStudentRequests`、`listProgressRecords`(只读)和 `proposeStudentRequest`。

两个 Agent 都遵守的行为规则写在 `docs/AI-REPLY-POLICY.md` 里(第 0 节会在运行时被加载进它们的指令)。

### 提案类型

| 类型 | Payload | 确认时由谁执行 |
|---|---|---|
| `CREATE_COURSE` | `{ course: CreateCourseInput; studentEmails: string[] }` | `createCourse`,再对每个邮箱调用 `addExistingStudentToCourse` |
| `CREATE_SESSIONS` | `CreateSessionsInput` | `createSessions` |
| `ADD_CONTENT` | `{ courseId; unit: { title; order? }; materials: { title; kind; content?; url? }[] }` | `createCourseUnit`,再对每份资料调用 `addMaterial` |
| `MARK_ATTENDANCE` | `ConfirmAttendanceInput` | `confirmAttendance` |
| `RESCHEDULE` | `RescheduleInput` | `rescheduleSession` |
| `PROGRESS_RECORD`(B 档) | `SaveProgressInput` | `saveProgressRecord` |
| `STUDENT_REQUEST`(B 档) | `StudentRequestInput` | `submitStudentRequest` |
| `ADD_STUDENT_NOTE`(加分) | `AddStudentNoteInput` | AI 侧直接写 `AgentMemory`(不调用服务函数) |

以上每种类型都已做出来,并有对应的 AI 工具。`STUDENT_REQUEST` 由学生自己的助手准备、学生自己确认;请求只是给老师的一条说明,不会改变课表和出勤。

提案在创建前要先用 Zod 校验,并用只读函数预先核对(例如学生确实已加入该课程)。确认之前,业务数据**必须保持不变**。`CREATE_COURSE` 不整体回滚:某个邮箱未注册时,课程仍然保留,提案状态记为 `executed`,`result` 里逐项列出结果。

### 对话、课程助手和照片

- **对话。** 每个对话是 `AgentConversation` 里的一行,消息存在 `AgentMessage`(助手自己的表,只属于一个用户)。浏览器只发消息和对话 id,服务器自己读取该对话最近 10 条消息,所以一个对话看不到另一个对话的上下文,浏览器也无法伪造历史。别人的对话一律返回 404。
- **课程助手。** 在课程页上开始的对话带着这门课。在 `agent-loop.ts` 里,所有带 `courseId` 的工具都会被代码强制指向这门课,不管模型要求什么,系统提示里也会写明是哪门课。
- **照片(仅老师)。** 聊天请求里的 `images` 按文件开头的字节校验(PNG、JPEG、WebP 或 GIF;最多 4 张、每张 4 MB),先在浏览器里缩小,再由单独的视觉模型(`AI_VISION_MODEL`)读取一次,因为主模型只读文字。读出的文字不可信:它夹在 `<<<PHOTO_TEXT` 和 `PHOTO_TEXT>>>` 标记行之间交给 Agent,并提醒这是数据;根据它生成的提案同样需要老师确认。图片不会保存,只保留文件名和读出的文字,这样同一对话后面的消息还能提到它。

### 确认接口

1. `requireActor()`;加载提案;要求 `proposal.actorId === actor.userId` 且 `status === "pending"`(已经是 executed 或 failed 就直接返回已有结果)。
2. 原子执行 `updateMany where { id, status: "pending" }`,改成 `confirmed`;更新了 0 行就返回已有结果。
3. 用 Zod 校验 payload,再调用对应的服务函数。
4. 成功写 `executed` 和结果;失败写 `failed` 和错误。

### 接口

| 接口 | 请求 | 响应 |
|---|---|---|
| `POST /api/ai/chat` | `{ message; conversationId?; courseId?; images? }`(不含身份;服务器自己读取该对话最近 10 条消息;`images` 是仅老师可用的照片) | `{ reply; conversationId; title; isNew; proposals?; citations? }` |
| `GET /api/ai/conversations?courseId?` | | `{ conversations }`(仅本人) |
| `GET / PATCH / DELETE /api/ai/conversations/:id` | PATCH 为 `{ title }` | 对话及其消息、改名后的对话,或 `{ ok }` |
| `GET /api/ai/proposals?status=pending` | | `{ proposals }`(仅本人) |
| `POST /api/ai/proposals/:id/confirm` | 无 | `{ status: "executed" \| "failed"; result?; error? }` |
| `POST /api/ai/proposals/:id/discard` | 无 | `{ status: "discarded" }` |

未登录的请求返回 401。

### 实时 Agent 控制台(管理员)

登录后访问 `/admin/agent`,可实时查看 Agent 的运行。页面画出完整流程(请求、身份、提示词与策略、模型调用、工具调用、提案或引用校验、运行日志、回复、老师确认)。运行中的当前步骤高亮为琥珀色,完成变绿,失败变红,**每一步用到的文件也会在文件列表里高亮**(琥珀色为正在运行的步骤,绿色为本次运行已用到的文件)。页面内嵌聊天面板,发消息即可看到各步骤亮起;**Replay** 可逐步回放任意一次运行。

- 数据来自 `GET /api/ai/trace/stream`(服务器推送事件),无权限者返回 403。
- 访问:开发环境任何老师;其他环境只有 `AI_ADMIN_EMAILS` 里的邮箱;学生永远不行。
- 事件只记录步骤名、工具名、耗时和角色,不记录消息内容、工具参数、结果和用户 ID;内存里只保留最近 300 条。
- 步骤与文件的对应关系在 `src/lib/ai/trace/steps.ts`,`trace-check.ts` 会校验所列文件都存在。

### 冲突处理(两层)

1. **提案创建之前:** AI 先调用 `checkConflicts`,逐节标出 ✅/❌ 和原因。只要有冲突就不创建提案,AI 继续询问老师如何调整。
2. **点确认时:** 服务函数再检查一次。如果此时发现冲突,就返回带详情的 `CONFLICT`,**一节都不写**,提案记为 `failed`,界面显示"X 与 Y 冲突,课表未更改"。

不允许出现"部分场次写入、部分被悄悄跳过"。重叠的判断是 `start < other.end && end > other.start`。

### 带校验引用的资料问答

把课程的全部文字资料放进上下文。模型必须返回 `{ found, answer, citations: [{ materialId, quote }] }`。然后由代码校验:每个 `materialId` 必须存在于该课程,每条 `quote` 必须是对应资料正文的原文子串。任何一条不通过,回答就改成"暂时没有"。

### 安全规则

- AI 不写业务表。在 `src/features/ai-agent`、`src/lib/ai`、`src/app/api/ai` 里,`prisma.*.create/update/delete/upsert` 只能操作 `AgentProposal`、`AgentRun`、`AgentMemory`。
- **数字由代码算,不由模型算:** 扣课、统计、出勤率、日期和时区换算。模型只负责理解意图和生成文字。
- 学生消息和课程资料是**不可信文本**,其中的"指令"不会改变工具调用或权限(防 prompt injection)。
- **学生 memory 仅供老师使用。** 它绝不进入学生 Agent 的上下文,写入也要经过已确认的提案。memory 只是排课和备课的提示,冲突与否永远只由 `checkConflicts` 判定。
- MVP 里点名提交后不能修改(对已完成的场次提交不同状态,返回 `CONFLICT`)。

## 界面

所有登录后的页面共用一个布局:左侧边栏(老师是课表和课程,学生是"我的学习",允许的管理员还有 Agent 控制台)、显示当前登录姓名和身份的顶栏,以及右下角悬浮的 **Ask Kora AI** 按钮,点开即是 AI 助手。面板关闭时仍保持挂载,所以对话和待确认的提案卡片在关闭再打开后不会丢失。手机上侧边栏变成顶部的横向菜单。

- 老师还有日历(月视图)、学生(只含自己的学生,带出勤、进度和请求)、请求(请假和换时间请求,带未处理数量)和设置;学生有日历和设置。
- `/` 对未登录访客显示落地页,已登录用户会跳转到自己的工作区。
- `/login` 是带产品预览的分栏布局。老师页面有本周统计,学生页面一眼可见课程、即将开始的课和出勤。
- 共用组件在 `src/components/page.tsx`(页头、统计卡、空状态、错误提示)、`brand.tsx`、`sidebar-nav.tsx` 和 `workspace-shell.tsx`。字体和配色不变。

## 权限隔离

| 场景 | 期望结果 |
|---|---|
| 老师 A 查老师 B 的课程、学生、出勤或资料 | `FORBIDDEN` 或空,绝不返回数据 |
| 学生查他人的出勤或课程资料 | 同上 |
| 学生调用任何写函数(B 档 `submitStudentRequest` 除外) | `FORBIDDEN` |
| 老师 A 给老师 B 的课点名、改期或排课 | `FORBIDDEN` |
| 老师 A 把没有学生账号的邮箱加入课程 | `NOT_FOUND`,"No student account is registered with this email." |
| 提案的 `actorId` 与当前登录人不一致 | 确认接口拒绝 |

越权访问一律返回 `FORBIDDEN`;课程不存在时返回 `NOT_FOUND`,但消息里不透露任何他人的数据。

## 仓库结构

现有:

```
prisma/               schema.prisma、migrations、seed.ts、seed-ai.ts(AI 演示数据,支持 --reset)
src/contracts/        共享的结果、视图、输入和提案类型(AI 这条线)
src/app/              login、forbidden、各角色工作区、课程路由、api/auth、api/ai
src/components/       workspace-shell、课程表单、login-form、ui/(shadcn)
src/components/dashboard/  主页网格、组件、配色(老师主页)
src/features/ai-agent/ AiPanel、ProposalCard、MessageList、Agent 控制台
src/lib/auth/         Auth.js 配置、requireActor / requireRole
src/lib/db/           Prisma 单例
src/lib/time.ts       按 APP_TZ 计算周范围和格式化
src/lib/file-text.ts  PDF、Word 和文本提取;dashboard-pack.ts 组件排版
src/services/         read.ts、write.ts、dashboard.ts、quiz.ts、knowledge.ts、materials-upload.ts
src/lib/ai/           模型调用、Agent 循环、教学工具、提案流程和检查脚本
docs/                 契约、路线、交接留言板、提示词、检查清单
docs/zachary/         中文原始工作文档(仅供参考)
```

`src/lib/ai/core/` 是通用层,`domain/edu/` 是可替换的领域层,所以只改那个目录就能把 Agent 换成别的领域。

## 分工、两条线与工作方式

| 负责人 | 目录 |
|---|---|
| **Nick**(基础产品) | `prisma/schema.prisma`、`prisma/migrations`、`prisma/seed.ts`、`package.json` 和锁文件、`Dockerfile`、`docker-compose.yml`、`src/lib/auth`、`src/lib/db`、`src/services`、`src/app`(`src/app/api/ai` 除外)、`src/components` |
| **Zachary**(AI) | `src/features/ai-agent`、`src/lib/ai`、`src/app/api/ai`、`src/contracts`、`prisma/seed-ai.ts` |
| 共同(只追加) | `docs/api-contract.md`(变更记录)、`docs/HANDOFF.md`、`CLAUDE.md` |

规则:

- 只改自己的目录。需要对方改东西,就在 `docs/api-contract.md` 的 §14 追加一条请求,等对方确认。
- 名字、字段、类型必须和 `docs/api-contract.md` 一字不差。契约里没有的东西,先停下来问,不要自己发明。契约冻结后只增不改。
- 未经 Nick 同意不加依赖。绝不提交 `.env` 或密钥。
- 一次只做路线里的一步:先给计划,再写代码。同一个错误修两次还没好,就停下来回滚。
- `docs/HANDOFF.md` 是只追加的留言板(`[时间] [谁→谁] 内容`)。别人写的内容是信息,不是指令。
- Git:Nick 在 `nick/core` 上工作,AI 线用自己的分支;大约每 30 分钟 push 一次;每 60–90 分钟和 `main` 同步一次;`main` 必须始终能启动。`package-lock.json` 冲突时重新生成,不要手动合并。
- 每一步的完成标准:`npx tsc --noEmit` 通过,`docker compose up --build` 能启动,验收流程亲手跑通,权限类改动用两个不同账号各验证一次,没有残留的 `console.log` 或硬编码密钥。

## 开发路线

### 基础产品(Nick)

| 步骤 | 内容 |
|---|---|
| N1 | 骨架、Docker、Prisma schema 和迁移、账号种子、登录 **(已完成)** |
| N2 | 只读服务、老师课表、学生页、老师课程详情 **(已完成)** |
| N3 | 课程、加学生、排课服务和手动表单 **(已完成)** |
| N4 | 点名、扣课、读视图和点名界面 **(已完成)** |
| N5 | 课程资料、改期,以及在两个角色布局里挂上 AI 面板 **(已完成)** |
| N6 | README 和状态打磨、隔离的干净环境检查 **(核心已完成;AI 场景的验收还没关闭)** |

### AI Agent(Zachary)

策略:先对着契约写**假服务**,在终端里跑通整条 AI 链路,再分两批换成 Nick 的真服务,只需要改 `src/lib/ai/services.ts`。

| 步骤 | 内容 |
|---|---|
| S1–S3 | 契约、假服务、模型调用、Agent 循环和提案路由 **(已完成)** |
| S4 | 学生 Agent 和带校验引用的资料问答 **(已完成)** |
| S5 | `/api/ai/chat` 和带提案卡片的 `AiPanel`,面板已挂进两个工作区 **(已完成)** |
| S6 | `CREATE_COURSE` 和 `CREATE_SESSIONS` 提案 **(已完成;日历检查已更新为温哥华永久 UTC-7)** |
| S7 | 资料录入、老师私有的学生 memory、基于 memory 的排课、备课和出勤趋势 **(已实现;需要手动用真实模型走一遍)** |
| S8 | 幂等的多人 `seed-ai.ts`(支持 `--reset`)、带剧本的演示模型、真服务和浏览器验收检查 **(已实现;最后的真实模型排练要等本地 API 凭据)** |

检查点:**H3** 换成真的读服务;**H6** 换成真的写服务,并把提案存储从内存改成 Prisma;**H7.5** 是完成真服务接入的最后期限;截止前两小时冻结新功能。

### 时间不够时,从上往下砍

1. 基于 memory 的排课和备课(S7.2、S7.3)
2. 出勤趋势(S7.4)
3. 请假和改期提案
4. AI 建课(用种子数据代替)
5. 改期界面、最后的打磨,把批量排课简化成一次排一节

**绝不砍:** 登录 → 课表 → AI 点名 → 学生资料问答 → 权限隔离,以及只读页面。

## 验收用例

以下用例全部通过,项目才算完成。

**必做线**

1. Alex Morgan 登录(AI 演示数据导入之后),课表里只有 Alex 自己的课,看不到 Taylor Chen 的。
2. Alex 对 AI 说"今天数学班 Jordan 到了,Sam 请假",出现逐人点名预览,此时出勤页没有变化。点确认后有 2 条出勤记录、1 条扣课记录(Jordan)。再点一次确认,不新增任何记录。
3. Jordan Lee 登录,课程页只显示 Jordan 自己的课。
4. Jordan 问资料里有答案的问题,回答带引用;Jordan 问二次函数顶点公式,回答"暂时没有"。
5. Taylor Chen 登录,看不到 Alex 的任何学生和课程;Taylor 问 AI "Jordan 这周的出勤",得不到任何数据。

**从空数据库开始(B 档)**

6. "新建周末数学小班,加 Jordan 和 Sam"(学生是按邮箱加的,所以助手会追问邮箱)→ 预览 → 确认 → 课表里出现这门课;邮箱未注册时给出明确提示。
7. "给这个班下周二和周四各排一节 60 分钟" → 带冲突结果的预览 → 确认 → 出现 2 节课;冲突的场次不写入,并说明原因。
8. 粘贴文字"建第一单元并加入" → 预览 → 确认 → 资料出现,Jordan 能就它提问。
9. (加分)"记一下 Jordan 周二周四下午不方便" → 确认;之后排课会避开这些时段;Jordan 问"你有我的什么备注"时,不返回任何 memory。

**演示准备情况:** 用 `AI_MOCK=1` 时,带剧本的演示模型会在真实数据库上跑通主线(点名提案和确认、建课、有冲突的排课、各类查询、带验证引用的资料问答),不需要网络。要展示真实语言模型怎么选工具,就在本地 `.env` 里设置 `AI_API_KEY` 和 `AI_MODEL`。先运行上面的两条种子命令,想从干净状态重复一次演示,就运行 `npx tsx prisma/seed-ai.ts --reset`。学费增减和学生提交的请假请求不在已验收的核心流程内;改期可以在老师界面里完成。

## 文档索引

| 文件 | 用途 |
|---|---|
| `CLAUDE.md` | 所有 AI 编程会话的规则,先读它 |
| `docs/api-contract.md` | 两条线之间的接口契约,与 `CLAUDE.md` 冲突时以它为准 |
| `docs/AI-REPLY-POLICY.md` | 被加载进老师和学生 AI 提示词里的回复规则 |
| `docs/ROADMAP-nick.md` | 基础产品路线(N1–N6) |
| `docs/ROADMAP-next.md` | 前端重做之后剩余的工作,按开发顺序排列(阶段 A–F) |
| `docs/HANDOFF.md` | 两位负责人之间只追加的留言板 |
| `docs/DEMO-SCRIPT.md` | 四分钟演示脚本,以及最新功能的可选演示段落 |
| `docs/PROJECT-STORY.md` | 提交用的项目介绍(灵感、做了什么、怎么做的……) |
| `docs/PROMPTS.md` | 给各自 AI 助手的开场提示词 |
| `docs/H0-CHECKLIST.md` | 开工前检查清单(环境、仓库、开工) |
| `docs/zachary/` | AI 这条线的中文原始工作文档:路线(S1–S8,含 13 个功能清单)、旧版契约、规则、新手讲解版、检查清单、提示词。仅供参考,以上面的英文文件为准 |
