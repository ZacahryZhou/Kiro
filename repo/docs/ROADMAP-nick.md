# Nick 开发路线（基础产品）— 详细版

> 开始前读：`CLAUDE.md`、`docs/api-contract.md`、`docs/HANDOFF.md`。名字、字段一字不差照契约。
> 规则：一次只做一个子步骤（如 N1.2），做完验收才进下一个。每个子步骤先让 AI 给计划再写代码。
> 每约 30 分钟 commit + push。卡住超过 30 分钟，或同一错误修两次没好 → 停下，叫 Zachary。
> 只改自己的目录（`CLAUDE.md` §2）。契约里没有的函数/字段，先在契约 §14 登记，不要自己发明。
> 最终网站目标：老师和学生登录后各看到自己的课表/课程/资料/出勤；AI 面板（Zachary 做）嵌在页面里。

## 目标目录结构（照这个建）
```
prisma/schema.prisma  seed.ts
src/lib/db/prisma.ts                 Prisma 单例
src/lib/auth/                        Auth.js 配置、actor.ts（requireActor）
src/services/read.ts  write.ts       全部服务函数（返回 Result<T>）
src/services/helpers.ts              通用：时间重叠、权限检查（可选）
src/app/login/page.tsx
src/app/(teacher)/layout.tsx         老师布局（这里加 <AiPanel/> 一行）
src/app/(teacher)/teacher/page.tsx                课表
src/app/(teacher)/teacher/courses/page.tsx        课程列表 + 新建课程
src/app/(teacher)/teacher/courses/[id]/page.tsx   课程详情（学生/场次/资料/出勤）
src/app/(student)/layout.tsx         学生布局（这里加 <AiPanel/> 一行）
src/app/(student)/student/page.tsx                我的课程和课表
src/app/(student)/student/courses/[id]/page.tsx   课程资料
src/components/**                    通用组件
```

---

## N1 项目能跑起来（H0–1.5）【最容易卡，Zachary 重点盯】

**N1.1 建项目骨架（20 分钟）**
- 在仓库根目录：`npx create-next-app@latest . --ts --tailwind --app --src-dir --eslint --no-turbopack`（目录里已有文件时选择保留）
- `npx shadcn@latest init`，再加组件：`npx shadcn@latest add button input label card table dialog select tabs badge textarea`
- 装依赖：`npm i prisma @prisma/client zod next-auth@beta bcryptjs` 和 `npm i -D @types/bcryptjs tsx`
- 在 `package.json` 加脚本：`"db:seed": "tsx prisma/seed.ts"`、`"db:seed:demo": "tsx prisma/seed-ai.ts"`
- 验收：`npm run dev` 能打开 localhost:3000 默认页
- 提交并 push，**把 package.json 的所有依赖一次装齐**（之后别人不改它）

**N1.2 Docker 能启动（30 分钟，最容易卡）**
- 仓库里已有 `Dockerfile`、`docker-compose.yml`、`.env.example`；复制 `.env.example` 为 `.env`
- 先只启动数据库测试：`docker compose up db`（看到 database system is ready）
- 再整体：`docker compose up --build`
- 卡住就把完整报错贴给 AI，**30 分钟没通 → 叫 Zachary**
- 验收：`docker compose up --build` 后 localhost:3000 能打开

**N1.3 数据库表（30 分钟）**
- `npx prisma init`，把 `schema.prisma` 按契约 §2 写完整：User、Course、Enrollment、Session、SessionChange、Attendance、Deduction、CourseUnit、Material，以及 **AgentRun、AgentProposal、AgentMemory**（后三张只建表，不写函数）
- 枚举用契约 §1.3；ID 用 `@default(cuid())`；时间字段 `DateTime`；金额 `Int`
- 唯一约束：Enrollment(courseId,studentId)、Attendance(sessionId,studentId)、Deduction(sessionId,studentId)；Session 加索引(courseId,startAt)
- `npx prisma migrate dev --name init`
- `src/lib/db/prisma.ts` 写 Prisma 单例
- 验收：`npx prisma studio` 能看到所有表
- 完成后立刻 push 并在 HANDOFF 通知 Zachary（他要用 schema）

**N1.4 种子账号（15 分钟）**
- `prisma/seed.ts`：陈老师 teacher1、刘老师 teacher2、小王 student1、小李 student2、小陈 student3，邮箱 `…@example.test`，密码用 bcrypt 哈希，只写在 seed 文件里
- 幂等（用 upsert），`NODE_ENV=production` 直接退出
- 验收：`npm run db:seed` 跑两次，User 表仍只有 5 条

**N1.5 登录（40 分钟）**
- Auth.js（credentials：邮箱+密码），session 里带 userId 和 role
- `src/lib/auth/actor.ts`：`requireActor()` 从会话取出 `{userId, role}`，未登录抛重定向/返回 UNAUTHENTICATED
- `/login` 页：邮箱、密码、登录按钮，错误提示用中文
- 登录后跳转：TEACHER → `/teacher`，STUDENT → `/student`；访问对方区域时拒绝
- 验收：teacher1 登录进 /teacher；student1 登录进 /student；student1 手动输入 /teacher 被拦；退出登录有按钮
- **N1 全部完成 → push，HANDOFF 通知 Zachary。**

---

## N2 只读函数 + 课表页（1.5–3）

**N2.1 只读服务函数（`src/services/read.ts`）**，全部返回 `Result<T>`，类型从 `src/contracts/views.ts` 引用（Zachary 会推；没推之前先在本文件内按契约 §3 写同名类型，之后统一）
- `listMyCourses(actor)`：老师=自己的课；学生=已加入的课；返回 CourseView[]（含 teacherName、studentCount）
- `getTeacherSchedule(actor, {from,to,courseId?})`：仅老师；只含自己课程；按 startAt 升序；上限 200
- `listMyStudents(actor, {courseId})`：仅老师且课程属于他，否则 FORBIDDEN
- `getCourseMaterials(actor, {courseId})`：老师=自己课程；学生=已加入课程；返回 units+materials，按 order
- `getStudentWorkspace(actor, {from,to})`：仅学生；只含本人的课程/场次/出勤
- 权限原则：越权一律 FORBIDDEN，不泄露他人数据
- 验收：写个简单脚本或页面调用，teacher1 能查到自己的，用 teacher2 的 actor 查 teacher1 的课程返回 FORBIDDEN

**N2.2 老师课表页 `/teacher`**
- 顶部：本周/下周切换；列表按日期分组显示场次：时间（按 `APP_TZ` 显示）、课程名、状态徽章（待上课/已改期/已取消/已完成）
- 每个场次可点进 `/teacher/courses/[id]`
- 空状态文案："还没有课程，可以让 AI 助手帮你建课"
- 验收：先用 Prisma Studio 手动插入一条 Course+Session，课表页能看到

**N2.3 学生页 `/student`**
- 我的课程列表 + 即将到来的课；点课程进 `/student/courses/[id]`
- 验收：student1 只看到自己加入的课

**N2.4 老师课程详情骨架 `/teacher/courses/[id]`**
- 用 Tabs：学生 / 场次 / 资料 / 出勤（先做学生和场次两个 tab 的只读展示，其余 tab 放占位）

- **N2 完成 → push，HANDOFF 通知（H3 检查点：Zachary 把假读函数换成这里的真函数）。**

---

## N3 建课、加学生、排课（3–5）

**N3.1 写服务函数（`src/services/write.ts`）**
- `createCourse(actor, CreateCourseInput)` → `{courseId}`；仅老师；入参用 Zod 校验（Zod 来自 `src/contracts/inputs.ts`）
- `addExistingStudentToCourse(actor, {courseId,email})` → `{enrollmentId, alreadyJoined}`；邮箱找不到学生账号 → NOT_FOUND，message「该邮箱尚未注册学生账号」；已加入 → `alreadyJoined:true`，不报错不重复
- 冲突检查辅助函数：判断时间区间重叠（开始<对方结束 且 结束>对方开始）。范围：该老师所有课程场次 + 该课程已加入学生在其他课程的场次
- `checkConflicts(actor, input)`（放 read.ts）→ ConflictView[]
- `createSessions(actor, CreateSessionsInput)`：先检查每一节（含本批内部互相冲突）；任意冲突 → **全部不写**，返回 `CONFLICT` + `details: ConflictView[]`；全部通过才在事务内写入，状态 SCHEDULED
- 验收：用脚本调用——重复加同一学生不出现两条 Enrollment；排冲突的课返回 CONFLICT 且 Session 表无新增

**N3.2 手动表单页面（基础功能，AI 之外的入口）**
- `/teacher/courses`：课程列表 + 「新建课程」弹窗（名称、科目、类型、地点、描述、每节价格）
- 课程详情「学生」tab：输入邮箱「添加学生」按钮；错误中文提示
- 课程详情「场次」tab：「批量排课」表单（日期、开始时间、时长、重复几周）；有冲突时显示冲突列表，不提交
- 验收：手动建课→加小王→排 2 节课→课表页能看到；再排一节冲突的课，页面显示冲突原因且课表未变

- **N3 完成 → push，HANDOFF 通知 Zachary。**

---

## N4 点名与扣课（5–6.5）

**N4.1 `confirmAttendance`（规则严格照契约 §6.1）**
- 仅老师且场次属于其课程；场次状态须 SCHEDULED/RESCHEDULED
- `records` 必须覆盖该课程**全部已加入学生**，缺人 → VALIDATION「还有 N 名学生未点名」
- 事务：写 Attendance；PRESENT/ABSENT 各写 1 条 Deduction（amount=课程每节价格，reason=状态）；LEAVE 不写；场次 → COMPLETED；写一条 SessionChange
- 重复调用且结果相同 → 返回既有结果，不重复写；已完成后提交**不同**状态 → CONFLICT「已点名，暂不支持修改」
- `listAttendance`、`listDeductions`（read.ts）：老师=自己课程范围；学生=只返回本人
- 验收：2 名学生一节课，点名（到、请假）→ Attendance 2 条、Deduction 1 条；再点一次 → 无新增

**N4.2 点名页面**
- 课程详情「场次」tab 里，待上课场次有「点名」按钮 → 列出所有学生，每人三选一（到课/请假/旷课），提交
- 「出勤」tab：按场次列出每人状态和扣课记录
- 学生页：能看到自己的出勤记录
- 验收：手动点名一次，出勤页、学生页都能看到；再提交不会重复扣课

- **N4 完成 → push，HANDOFF 通知（H6 检查点：Zachary 把假写函数换成真函数）。**

---

## N5 资料、改期、AI 入口（6.5–8）

**N5.1 资料**
- `createCourseUnit(actor, {courseId,title,order?})`、`addMaterial(actor, {unitId,title,kind,content?,url?})`；老师只能操作自己的课程
- 课程详情「资料」tab：新建单元、在单元里添加文字资料（标题+正文）或链接
- `/student/courses/[id]`：学生查看所有单元和资料（文字全文显示）
- 验收：老师加一段文字资料，小王登录能看到；小陈（没加入该课）打开该课 URL → 被拒

**N5.2 改期（可降级）**
- `rescheduleSession(actor, {sessionId,newStartAt})`：冲突检查排除自身；有冲突 → CONFLICT 不写；成功 → 保存 originalStartAt、状态 RESCHEDULED、写 SessionChange；不扣课
- 场次旁「改期」按钮 + 选新时间
- 验收：改到冲突时间被拒；改到空闲时间课表更新

**N5.3 AI 入口（等 Zachary 通知组件已就绪）**
- 在 `(teacher)/layout.tsx` 和 `(student)/layout.tsx` **各加一行** `<AiPanel role="TEACHER" />` / `<AiPanel role="STUDENT" />`（来自 `src/features/ai-agent`）
- 位置：右侧抽屉或页面底部，由你定；确认提案后页面要能刷新看到新数据（AiPanel 内部调用 `router.refresh()`）
- 验收：登录后两个角色都能看到并打开 AI 面板

---

## N6 收尾（8 之后）
- 界面打磨：统一中文文案、空状态、错误提示；手机宽度也别太难看
- `README.md`：项目简介、怎么运行（`docker compose up --build`）、演示账号邮箱（不写密码）
- 干净环境验证：`docker compose down -v` 删数据 → `docker compose up --build` → `npm run db:seed` → 登录正常
- 演示前跑一遍契约 §13 的 1–5 号用例

---

## 时间不够时怎么砍
- 先砍：N5.2 改期 → N6 打磨 → N3.2 的批量排课表单（改为一次一节）
- **不能砍**：N1（登录）、N2（只读+课表）、N3.1（建课/加学生/排课函数）、N4（点名扣课）、N5.1（资料）、N5.3（AI 入口）
- 手动表单可以砍到只剩"建课"和"点名"两个，其余让 AI 提案代替
