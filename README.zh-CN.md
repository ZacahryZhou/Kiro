<p align="right"><a href="README.md">English</a> | <b>简体中文</b></p>

# Kora

**面向小型培训机构(一对一、小班)的 AI 优先教学协作平台。**

老师和学生可以用自然语言向 AI Agent 提问或下指令。这个产品最核心的原则是"可信":**AI 不会自己写业务数据。** 老师所有的写操作都走 *AI 提案 → 老师确认 → 服务函数执行*。

> Kora 原名 EduSync,个别内部标识符(例如本地数据库名 `edusync`)仍沿用旧名字。

---

## 目录

1. [工作原理](#工作原理)
2. [项目现状](#项目现状)
3. [功能](#功能)
4. [技术栈](#技术栈)
5. [快速开始](#快速开始)
6. [演示账号与种子数据](#演示账号与种子数据)
7. [架构](#架构)
8. [AI Agent](#ai-agent)
9. [权限隔离](#权限隔离)
10. [仓库结构](#仓库结构)
11. [分工、两条线与工作方式](#分工两条线与工作方式)
12. [开发路线](#开发路线)
13. [验收用例](#验收用例)
14. [文档索引](#文档索引)

---

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
| Prisma schema(12 张表)和初始迁移 | 已完成 |
| 演示账号种子(幂等,生产环境拒绝运行) | 已完成 |
| 邮箱密码登录、按角色保护路由、`requireActor()` | 已完成 |
| 只读服务(`src/services/read.ts`):课程、课表、学生、资料、学生工作区 | 已完成 |
| 老师课表页(本周 / 下周) | 已完成 |
| 学生页(我的课程和未来 30 天的场次) | 已完成 |
| 老师课程管理、学生加入、排课、点名和扣课 | 已完成 |
| 课程单元和资料(老师编辑,学生阅读) | 已完成 |
| 场次改期(老师界面、冲突检查、变更记录) | 已完成 |
| 按角色区分的 AI 面板、聊天接口、只读问答、带验证引用的资料问答、提案流程 | 已接入;要得到真实模型的回复,需要配置 AI 接口 |
| 完整的多人 AI 演示数据(`prisma/seed-ai.ts`) | 已完成;`npm run db:seed:demo`,或用 `npx tsx prisma/seed-ai.ts --reset` 从干净状态重来 |
| AI 提案和运行记录存进数据库(`AgentProposal`、`AgentRun`) | 已完成;只写 AI 自己的表 |
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
| 9 | 基于 memory 排课 | "给数学班排下周的课" | 同 #5,候选时间避开已记录的不方便时段 | C · 已接入;有冲突的偏好会阻止创建提案 |
| 10 | 备课 | "帮我备明天数学班的课" | `ADD_CONTENT` 预览,含讲义草稿和 5 道练习 | C · 已接入;5 道题的输出经过校验,需要确认 |
| 11 | 改期 | "把 10/10 的课改到 10/11 下午 4 点" | 老师可以手动改期;AI 的 `RESCHEDULE` 提案未实现 | C · 手动流程已完成;AI 暂不可用 |
| 12 | 学生请假请求 | (学生)"下周二我想请假" | `STUDENT_REQUEST` 交给老师处理,课表不变 | C · 未实现 |
| 13 | 学费增减 | "给 Jordan 加 3 次课" | 不在当前 MVP 内;需要先在契约里约定新表、新函数和新提案类型 | C · 不在范围内 |

**最少要演示的一条线:** 功能 1 → 2 → 3 → 权限隔离,在演示数据上进行。可以用真实模型(`AI_API_KEY`、`AI_MODEL`)运行;没有网络和 key 时,用带剧本的演示模式(`AI_MOCK=1`),它能理解几类简单的话,并驱动同样的真实工具、提案、确认和数据库(它不是语言模型,所以展示不了真实模型是怎么选工具的)。

手动表单可以用来建课、加学生、排课、点名、管理资料和改期,所以不用 AI 核心流程也能用。

## 技术栈

- **前后端:** Next.js(App Router)、React、严格模式 TypeScript
- **界面:** Tailwind CSS、shadcn/ui
- **数据库:** PostgreSQL 17 + Prisma 6
- **登录:** Auth.js(next-auth v5 beta),邮箱 + 密码,JWT 会话
- **校验:** Zod
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

容器启动时会自动运行 `prisma generate` 和 `prisma migrate deploy`,所以表结构会自动建好。

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
| `AI_MOCK` | 设为 `1` 时用带剧本的演示模型代替真实模型(不需要网络和 key),但仍然使用真实工具和数据库 |

### 常用命令

```bash
docker compose up --build            # 启动
docker compose down                  # 停止
docker compose down -v               # 停止并清空数据库
docker compose logs -f app           # 查看应用日志
docker compose exec app npm run db:seed   # 创建演示账号(幂等)
docker compose exec app npx tsx prisma/seed-ai.ts --reset   # 从干净状态导入 AI 演示数据
npx tsx src/lib/ai/dev/run-all.ts    # 运行全部离线 AI 检查,输出一份汇总
npx tsc --noEmit                     # 类型检查
npm run lint                         # 代码检查
```

基础种子只创建两个账号。再运行一步 AI 演示数据,才会创建多人的课程、出勤、资料、冲突场次和老师私有的 memory。

### 干净环境检查

`docker compose down -v` → `docker compose up --build` → `docker compose exec app npm run db:seed` → `docker compose exec app npm run db:seed:demo` → 登录。

不需要真实 AI key 就能运行全部离线 AI 检查(假服务、不用 key):`npx tsx src/lib/ai/dev/run-all.ts`,或者更短的 `npm run check:ai`。真实数据库的验收检查,在应用容器里运行 `NODE_ENV=development npx tsx src/lib/ai/dev/real-services-check.ts`。

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
- `AgentMemory` 示例:Jordan 周二周四下午不方便;Sam 在函数部分较弱。

基础账号种子和 AI 演示种子都是幂等的,`NODE_ENV=production` 时拒绝运行。五个 AI 角色的邮箱是 `t+alex@example.test`、`t+taylor@example.test`、`s+jordan@example.test`、`s+sam@example.test` 和 `s+casey@example.test`。

## 架构

```
浏览器
 ├─ 老师 / 学生页面(src/app/**)── 调用 ──▶ src/services/** ──▶ Prisma ──▶ PostgreSQL
 └─ <AiPanel/>
      │ POST /api/ai/chat
      ▼
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

老师 Agent 和学生 Agent 是同一个循环,只是系统提示和工具集不同。学生没有任何提案或写入工具(B 档的请假请求是唯一例外)。

老师的只读工具:`getTeacherSchedule`、`listMyCourses`、`listMyStudents`、`listAttendance`、`listDeductions`、`checkConflicts`、`getCourseMaterials`、`getAttendanceTrends`、`getStudentMemory`。老师只准备待确认提案的工具:`proposeMarkAttendance`、`proposeCreateCourse`、`proposeCreateSessions`、`proposeAddContent`、`proposeAddStudentNote`、`proposeLessonPrep`。学生的只读工具:`getStudentWorkspace`、`answerFromCourseMaterials`。

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

其中 `CREATE_COURSE`、`CREATE_SESSIONS`、`ADD_CONTENT`、`MARK_ATTENDANCE` 和 `ADD_STUDENT_NOTE` 已经做出来;`RESCHEDULE`、`PROGRESS_RECORD` 和 `STUDENT_REQUEST` 在契约里有定义,但还没有 AI 工具(改期在老师界面里可以用)。

提案在创建前要先用 Zod 校验,并用只读函数预先核对(例如学生确实已加入该课程)。确认之前,业务数据**必须保持不变**。`CREATE_COURSE` 不整体回滚:某个邮箱未注册时,课程仍然保留,提案状态记为 `executed`,`result` 里逐项列出结果。

### 确认接口

1. `requireActor()`;加载提案;要求 `proposal.actorId === actor.userId` 且 `status === "pending"`(已经是 executed 或 failed 就直接返回已有结果)。
2. 原子执行 `updateMany where { id, status: "pending" }`,改成 `confirmed`;更新了 0 行就返回已有结果。
3. 用 Zod 校验 payload,再调用对应的服务函数。
4. 成功写 `executed` 和结果;失败写 `failed` 和错误。

### 接口

| 接口 | 请求 | 响应 |
|---|---|---|
| `POST /api/ai/chat` | `{ message; history? }`(最近 10 条,只含文字,不含身份) | `{ reply; proposals?; citations? }` |
| `GET /api/ai/proposals?status=pending` | | `{ proposals }`(仅本人) |
| `POST /api/ai/proposals/:id/confirm` | 无 | `{ status: "executed" \| "failed"; result?; error? }` |
| `POST /api/ai/proposals/:id/discard` | 无 | `{ status: "discarded" }` |

未登录的请求返回 401。

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
src/features/ai-agent/ AiPanel、ProposalCard、MessageList
src/lib/auth/         Auth.js 配置、requireActor / requireRole
src/lib/db/           Prisma 单例
src/lib/time.ts       按 APP_TZ 计算周范围和格式化
src/services/         read.ts 和 write.ts 业务服务
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
| `docs/HANDOFF.md` | 两位负责人之间只追加的留言板 |
| `docs/PROMPTS.md` | 给各自 AI 助手的开场提示词 |
| `docs/H0-CHECKLIST.md` | 开工前检查清单(环境、仓库、开工) |
| `docs/zachary/` | AI 这条线的中文原始工作文档:路线(S1–S8,含 13 个功能清单)、旧版契约、规则、新手讲解版、检查清单、提示词。仅供参考,以上面的英文文件为准 |
