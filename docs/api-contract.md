# EduSync 对接清单 v0.4（含 AgentMemory；待与 Nick 在 H0–1 核对并冻结）

> 依据：PRD《v1.4 AI 主打修订稿 4》。放在仓库 `docs/api-contract.md`。
> **冻结后只增不改。** 想加东西 → 先写进 §14「变更记录」→ 对方确认 → 负责人实施。
> 带 ★ 的是**默认决定**，H0 讨论时可改，改完才冻结。

---

## 0. 总规则
1. **actor 只来自登录会话**：`requireActor()`（Nick，`src/lib/auth/actor.ts`）。任何函数、路由都不接受前端或模型传来的 userId / role。
2. **AI 只能调用只读函数 + 写 AgentProposal**。写业务数据只发生在老师点"确认"之后，由 Zachary 的确认接口调用 Nick 的写函数。
3. **Nick 的服务函数不认识 AgentProposal**；手动表单与 AI 确认接口调用同一批函数。
4. 所有服务函数返回 `Result<T>`，**不向调用方抛异常**。
5. 密钥只放 `.env`。

## 1. 通用约定

### 1.1 类型（`src/contracts/common.ts`）
```ts
export type Role = "TEACHER" | "STUDENT";
export type Actor = { userId: string; role: Role };
export type ErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "INTERNAL";
export type ServiceError = { code: ErrorCode; message: string; details?: unknown }; // message 为中文，可直接展示
export type Result<T> = { ok: true; data: T } | { ok: false; error: ServiceError };
```
### 1.2 ID、时间、金额
- ★ **ID**：字符串（Prisma `cuid()`），不要用数字。
- ★ **时间**：接口里一律 **ISO 8601 UTC 字符串**（如 `"2026-10-08T23:00:00.000Z"`）。数据库存 UTC。
- ★ **时区**：产品默认 `America/Vancouver`（环境变量 `APP_TZ`）。页面显示、AI 理解"周四下午 4 点"都按此时区转换；**AI 提案里存的必须是已转换好的 UTC**。
- **金额**：整数“分”（`pricePerSessionCents`），不使用小数。
- ★ **列表上限**：每个读函数最多返回 200 条，不做分页。
- **枚举值全大写英文**，页面再翻译成中文。

### 1.3 枚举
```
Role: TEACHER | STUDENT
CourseType: ONE_ON_ONE | SMALL_CLASS
SessionStatus: SCHEDULED | RESCHEDULED | CANCELLED | COMPLETED
AttendanceStatus: PRESENT | LEAVE | ABSENT
MaterialKind: TEXT | LINK
MemoryKind: AVAILABILITY | NOTE
ProposalStatus: pending | confirmed | executed | failed | discarded
ProposalType: CREATE_COURSE | CREATE_SESSIONS | ADD_CONTENT | MARK_ATTENDANCE | RESCHEDULE | PROGRESS_RECORD | STUDENT_REQUEST | ADD_STUDENT_NOTE
```

---

## 2. 数据表（Nick 写成 schema.prisma）
（字段同 v0.1，补充以下约束）
- User：email 唯一；role；passwordHash（Auth.js 凭据登录）。
- Course：teacherId、name、subject、type、location?、description?、pricePerSessionCents(默认 0)。
- Enrollment：**唯一 (courseId, studentId)**。
- Session：courseId、startAt、durationMin、location?、linkUrl?、status、originalStartAt?。**索引 (courseId, startAt)**。
- SessionChange：sessionId、changedById、fromStatus、toStatus、oldStartAt?、newStartAt?、createdAt。
- Attendance：**唯一 (sessionId, studentId)**；status；markedById；markedAt。
- Deduction：**唯一 (sessionId, studentId)**；courseId；amountCents；reason(PRESENT|ABSENT)；createdAt。
- CourseUnit：courseId、title、order。
- Material：unitId、title、kind、content?、url?（TEXT 必有 content；LINK 必有 url）。
- AgentRun：actorId、role、intentSummary、toolCalls(Json)、status(OK|ERROR)、error?、createdAt。
- AgentProposal：type、actorId、courseId?、payload(Json)、summary(String，给界面展示的一句话)、status、result(Json?)、error?、createdAt、confirmedAt?、executedAt?。
- **AgentMemory**（Nick 只负责建表和迁移，**不写任何服务函数**；读写全部由 Zachary 的 AI 侧完成）：id、courseId、studentId、teacherId、kind(AVAILABILITY|NOTE)、content(String，≤500 字)、createdAt。索引 (teacherId, studentId)。仅老师可见，学生任何接口都不得返回。
- 删除规则：★ MVP 不提供删除功能（不做级联删除设计）。

---

## 3. 返回数据类型（放 `src/contracts/views.ts`；Nick 的函数和页面、Zachary 的 AI 都用）
```ts
export type CourseView = {
  id: string; name: string; subject: string; type: "ONE_ON_ONE"|"SMALL_CLASS";
  location?: string; description?: string; teacherName: string; studentCount: number;
};
export type SessionView = {
  id: string; courseId: string; courseName: string;
  startAt: string; durationMin: number; location?: string; linkUrl?: string;
  status: "SCHEDULED"|"RESCHEDULED"|"CANCELLED"|"COMPLETED"; originalStartAt?: string;
};
export type StudentView = { id: string; name: string; email: string };
export type AttendanceView = {
  id: string; sessionId: string; courseId: string; sessionStartAt: string;
  studentId: string; studentName: string; status: "PRESENT"|"LEAVE"|"ABSENT"; markedAt: string;
};
export type DeductionView = {
  id: string; sessionId: string; courseId: string; studentId: string; studentName: string;
  amountCents: number; reason: "PRESENT"|"ABSENT"; createdAt: string;
};
export type MaterialView = { id: string; unitId: string; title: string; kind: "TEXT"|"LINK"; content?: string; url?: string };
export type UnitView = { id: string; courseId: string; title: string; order: number; materials: MaterialView[] };
export type ConflictView = { sessionId: string; courseName: string; startAt: string; durationMin: number; withStudentId?: string };
```

---

## 4. 输入类型（`src/contracts/inputs.ts`，Zod；表单与 AI 共用）
```ts
const id = z.string().min(1);
const utc = z.string().datetime();           // ISO UTC

export const CreateCourseInput = z.object({
  name: z.string().min(1).max(80), subject: z.string().min(1).max(40),
  type: z.enum(["ONE_ON_ONE","SMALL_CLASS"]),
  location: z.string().max(120).optional(), description: z.string().max(500).optional(),
  pricePerSessionCents: z.number().int().nonnegative().default(0),
});
export const AddStudentInput = z.object({ courseId: id, email: z.string().email() });
export const CreateSessionsInput = z.object({
  courseId: id,
  sessions: z.array(z.object({
    startAt: utc, durationMin: z.number().int().min(15).max(480),
    location: z.string().max(120).optional(), linkUrl: z.string().url().optional(),
  })).min(1).max(30),
});
export const CreateUnitInput = z.object({ courseId: id, title: z.string().min(1).max(80), order: z.number().int().optional() });
export const AddMaterialInput = z.object({
  unitId: id, title: z.string().min(1).max(80), kind: z.enum(["TEXT","LINK"]),
  content: z.string().max(20000).optional(), url: z.string().url().optional(),
}).refine(v => (v.kind==="TEXT" ? !!v.content : !!v.url), "TEXT 需 content，LINK 需 url");
export const ConfirmAttendanceInput = z.object({
  sessionId: id,
  records: z.array(z.object({ studentId: id, status: z.enum(["PRESENT","LEAVE","ABSENT"]) })).min(1),
});
export const RescheduleInput = z.object({ sessionId: id, newStartAt: utc });
export const CheckConflictsInput = z.object({
  courseId: id, startAt: utc, durationMin: z.number().int().positive(), excludeSessionId: id.optional(),
});
// B 档
export const SaveProgressInput = z.object({
  sessionId: id, studentId: id, goal: z.string().min(1), output: z.string().min(1),
  issue: z.string().optional(), nextAction: z.enum(["PRACTICE","REVIEW","EXTRA_MATERIAL","RECAP_NEXT"]), note: z.string().optional(),
});
export const AddStudentNoteInput = z.object({
  courseId: id, studentId: id, kind: z.enum(["AVAILABILITY","NOTE"]), content: z.string().min(1).max(500),
});
export const StudentRequestInput = z.object({
  sessionId: id, kind: z.enum(["LEAVE","RESCHEDULE"]), note: z.string().max(300).optional(), preferredStartAt: utc.optional(),
});
```

---

## 5. 只读函数（Nick 实现；AI 可直接调用）— `src/services/read.ts`
| 函数 | 输入 | 返回 `data` | 谁可调用 / 规则 |
|---|---|---|---|
| `listMyCourses(actor)` ★新增 | — | `{ courses: CourseView[] }` | 教师：自己的课；学生：已加入的课 |
| `getTeacherSchedule(actor,{from,to,courseId?})` | utc 起止 | `{ sessions: SessionView[] }` 按 startAt 升序 | 仅 TEACHER；仅自己课程；不含 CANCELLED 之外的无效时间 |
| `listMyStudents(actor,{courseId})` | | `{ students: StudentView[] }` | 仅 TEACHER 且该课属于他 |
| `listAttendance(actor,{courseId?,sessionId?,studentId?,from?,to?,status?})` | | `{ records: AttendanceView[] }` | 教师：自己课程内；学生：**只返回本人记录**（忽略传入的 studentId） |
| `listDeductions(actor,{courseId?,sessionId?,studentId?})` | | `{ records: DeductionView[] }` | 同上 |
| `getCourseMaterials(actor,{courseId})` | | `{ units: UnitView[] }` 按 order | 教师：自己课程；学生：已加入课程；否则 FORBIDDEN |
| `checkConflicts(actor,CheckConflictsInput)` | | `{ conflicts: ConflictView[] }` | 仅 TEACHER；检查该教师所有课程 + 该课程已加入学生在其他课程的场次是否时间重叠 |
| `getStudentWorkspace(actor,{from,to})` | | `{ courses: CourseView[]; sessions: SessionView[]; attendance: AttendanceView[] }` | 仅 STUDENT；只含本人 |

规则：越权访问**一律返回 `FORBIDDEN`**（课程不存在也用 NOT_FOUND，但不要在 message 里透露他人数据）。

---

## 6. 写入函数（Nick 实现；表单与 AI 确认接口共用）— `src/services/write.ts`
| 函数 | 输入 | `data` | 规则与幂等 |
|---|---|---|---|
| `createCourse(actor, CreateCourseInput)` | | `{ courseId }` | 仅 TEACHER；★ 同一教师同名课程允许重复（不拦） |
| `addExistingStudentToCourse(actor, AddStudentInput)` | | `{ enrollmentId; alreadyJoined: boolean }` | 课程须属该教师；邮箱须对应 role=STUDENT 的账号，否则 `NOT_FOUND`（message："该邮箱尚未注册学生账号"）；已加入则返回 `alreadyJoined:true` |
| `createSessions(actor, CreateSessionsInput)` | | `{ sessionIds: string[] }` | 先对**每一节**检查冲突（含本批内部互撞）；有任意冲突 → 全部不写，返回 `CONFLICT` 且 `details: ConflictView[]`；全部成功才写（事务）；新场次 status=SCHEDULED |
| `createCourseUnit(actor, CreateUnitInput)` | | `{ unitId }` | 课程须属该教师；order 缺省取当前最大+1 |
| `addMaterial(actor, AddMaterialInput)` | | `{ materialId }` | 单元所在课程须属该教师 |
| `confirmAttendance(actor, ConfirmAttendanceInput)` | | `{ attendance: AttendanceView[]; deductions: DeductionView[]; sessionStatus }` | 见 §6.1 |
| `rescheduleSession(actor, RescheduleInput)` | | `{ sessionId; oldStartAt; newStartAt }` | 见 §6.2 |
| B：`saveProgressRecord(actor, SaveProgressInput)` / `submitStudentRequest(actor, StudentRequestInput)` | | | 学生请求只创建待处理记录，不改课表/出勤 |

### 6.1 confirmAttendance 的精确规则 ★
1. 仅 TEACHER，且 session 属于其课程。
2. session.status 必须是 `SCHEDULED` / `RESCHEDULED`，否则 `CONFLICT`（"该课已完成或已取消"）。
3. `records` 里每个 studentId 必须是该课程**已加入**学生，否则整体 `VALIDATION`。★ 必须覆盖全部已加入学生，缺人则 `VALIDATION`（"还有 N 名学生未点名"）。
4. 事务内：写 Attendance（唯一 (sessionId, studentId)）；`PRESENT`、`ABSENT` 各写 1 条 Deduction（amount = course.pricePerSessionCents，reason = 对应状态）；`LEAVE` 不写；然后 session.status → `COMPLETED`，写一条 SessionChange。
5. **重复调用**：session 已是 COMPLETED 且 Attendance 已存在 → 直接返回既有结果（`ok:true`，不重复写、不重复扣）。
6. ★ **点名后修改**（旷课改请假等）：**MVP 不支持**。已完成的课再次提交**不同**状态 → `CONFLICT`（"已点名，暂不支持修改"）。更正功能是 P1。

### 6.2 rescheduleSession 的精确规则 ★
1. 仅 TEACHER，session 属其课程；status 必须 `SCHEDULED`/`RESCHEDULED`。
2. 对新时间做冲突检查（排除自身）；有冲突 → `CONFLICT` + `details`，不写。
3. 无冲突：`originalStartAt` 若为空则存旧 startAt；`startAt = newStartAt`；status = `RESCHEDULED`；写 SessionChange。
4. 改期**不产生**扣课。


### 6.3 冲突提示的两层机制 ★（已确认：整批不写，但必须明确告知）
- **第一层（提案创建前）**：AI 先调用 `checkConflicts`，在预览里逐节标出 ✅/❌ 及冲突原因（例如"10/14 16:00 与「初二物理一对一」冲突（小王）"），有冲突时**不创建提案**，AI 继续询问老师如何调整。
- **第二层（点确认时）**：服务函数再检查一次；若此时才发现冲突 → 返回 `CONFLICT` + `details: ConflictView[]`，**不写入任何一节**，提案记为 `failed`，页面显示"X 与 Y 冲突，课表未更改"。
- 不允许出现"部分场次写入、部分被悄悄跳过"。

---

## 7. 权限一览（测试时逐行验证）
| 场景 | 期望 |
|---|---|
| 教师 A 查 教师 B 的课程/学生/出勤/资料 | FORBIDDEN 或空，**绝不返回数据** |
| 学生 查 他人出勤、他人课程资料 | 同上 |
| 学生 调用任何写函数（B 档 submitStudentRequest 除外） | FORBIDDEN |
| 教师 A 给 教师 B 的课点名/改期/排课 | FORBIDDEN |
| 教师 A 把未注册邮箱加入课程 | NOT_FOUND（不泄露其他信息） |
| AI 提案的 actorId ≠ 当前登录人 | 确认接口拒绝 |

---

## 8. 提案类型（Zachary，`src/contracts/proposals.ts`）
| type | payload | 确认时调用 | `summary` 示例 |
|---|---|---|---|
| CREATE_COURSE | `{ course: CreateCourseInput; studentEmails: string[] }` | createCourse → 逐个 addExistingStudentToCourse | "新建「周末数学小班」，加入 2 名学生" |
| CREATE_SESSIONS | `CreateSessionsInput` | createSessions | "为「周末数学小班」排 4 节课" |
| ADD_CONTENT | `{ courseId; unit: {title; order?}; materials: {title; kind; content?; url?}[] }` | createCourseUnit → 逐个 addMaterial | "新建单元「第一单元」并加入 2 份资料" |
| MARK_ATTENDANCE | `ConfirmAttendanceInput` | confirmAttendance | "10/8 数学班点名：到 2、请假 1" |
| RESCHEDULE | `RescheduleInput` | rescheduleSession | "10/10 16:00 的课改到 10/11 16:00" |
| PROGRESS_RECORD（B） | `SaveProgressInput` | saveProgressRecord | |
| STUDENT_REQUEST（B） | `StudentRequestInput` | submitStudentRequest | |
| ADD_STUDENT_NOTE（加分） | `AddStudentNoteInput` | **Zachary 侧**写 AgentMemory（不调用 Nick 函数；创建前用 `listMyStudents` 核对学生确在该课程） | "记录小王：周二、周四下午不方便" |

提案在**创建时**必须先用对应 Zod 校验；同时**预先**调用 `checkConflicts` / `listMyStudents` 等只读函数核对（例如学生名单是否真的在该课程内），校验不过不创建提案，让 AI 向老师追问。

学生 memory 规则：AgentMemory 只有老师的 Agent 能读，**绝不进入学生 Agent 上下文**；排课/备课只把它当参考，冲突与否永远由 `checkConflicts` 判定。

★ `CREATE_COURSE` 确认执行**不整体回滚**：课程已创建、某个邮箱未注册时，返回部分成功（课程已建 + 逐邮箱结果），状态记为 `executed`，`result` 里列出失败项。

---

## 9. 你的网址接口（Zachary，`src/app/api/ai/**`）
所有接口：未登录 → 401；返回 JSON。

| 接口 | 请求 | 响应 |
|---|---|---|
| `POST /api/ai/chat` | `{ message: string; history?: {role:"user"\|"assistant"; content:string}[] }`（★ history 由前端带最近 10 条，仅为对话上下文，不含任何身份信息） | `{ reply: string; proposals?: ProposalView[]; citations?: Citation[] }` |
| `GET /api/ai/proposals?status=pending` | | `{ proposals: ProposalView[] }`（仅本人） |
| `POST /api/ai/proposals/:id/confirm` | 无 body | `{ status: "executed"\|"failed"; result?: unknown; error?: ServiceError }` |
| `POST /api/ai/proposals/:id/discard` | 无 body | `{ status: "discarded" }` |

```ts
type ProposalView = { id: string; type: ProposalType; summary: string; payload: unknown; status: ProposalStatus; createdAt: string };
type Citation = { materialId: string; unitId: string; title: string; quote: string };
```
**确认接口步骤**（保证只执行一次）：
1. `requireActor()`；加载提案，校验 `proposal.actorId === actor.userId`、`status === "pending"`（若已是 executed/failed → 直接返回已有结果）
2. 原子更新 `pending → confirmed`（`updateMany where {id, status:"pending"}`，影响 0 行 → 返回已有结果）
3. Zod 校验 payload → 按 §8 调用服务函数
4. 成功 → `executed` + result；失败 → `failed` + error

---

## 10. AI 面板如何放进页面（所有权边界）
- Zachary 导出一个组件 `<AiPanel role="TEACHER" | "STUDENT" />`，位置 `src/features/ai-agent/index.ts`。
- **Nick 只在老师/学生布局里各加一行引用它**（`src/app/(teacher)/layout.tsx`、`(student)/layout.tsx`），位置由 Nick 决定（右侧抽屉或页面底部）。除此之外 Nick 不改 `features/ai-agent`。
- 页面路由（Nick）：`/login`、`/teacher`（课表）、`/teacher/courses/[id]`（学生、资料、出勤）、`/student`（课程）、`/student/courses/[id]`（资料）。
- 提案确认界面在 `<AiPanel />` 内部（Zachary）。老师确认后，AiPanel 触发页面刷新（`router.refresh()`），课表页就能看到新数据。

---

## 11. 种子数据（具体）
**`prisma/seed.ts`（Nick）** — `npm run db:seed`，只放账号，课程为空：
| 角色 | 姓名 | 邮箱 |
|---|---|---|
| TEACHER | 陈老师 | teacher1@example.test |
| TEACHER | 刘老师 | teacher2@example.test |
| STUDENT | 小王 | student1@example.test |
| STUDENT | 小李 | student2@example.test |
| STUDENT | 小陈 | student3@example.test |
密码：写在 seed 文件里（演示用，不进文档、不进聊天）。

**`prisma/seed-ai.ts`（Zachary）** — `npm run db:seed:demo`，在上面账号基础上追加（备用救场 + 联调）：
- 课程 A「初二数学小班」（陈老师；小王、小李）：2 个单元；资料含**明确事实**（供引用）；故意**不含**"二次函数顶点公式"（测试"暂时没有"）
- 课程 B「初二物理一对一」（陈老师；小王）：有一节与课程 A 下周二 16:00 **重叠**的场次（测试冲突）
- 课程 C「高一英语一对一」（刘老师；小陈）→ 用来验证陈老师的 AI **查不到小陈**
- 场次：每门课有已完成的（带出勤与扣课）、本周和下周的待上课场次
- 追加 AgentMemory 示例：小王「周二、周四下午不方便」（AVAILABILITY）、小李「函数部分较弱」（NOTE）
- 两个脚本均：幂等（重复运行不重复）、`NODE_ENV=production` 时拒绝运行

---

## 12. 环境变量（`.env.example`，Nick 维护）
```
DATABASE_URL=postgresql://edusync:edusync@db:5432/edusync
AUTH_SECRET=change-me
AUTH_URL=http://localhost:3000
APP_TZ=America/Vancouver
AI_BASE_URL=https://api.deepseek.com
AI_API_KEY=
AI_MODEL=
AI_MOCK=0
```

---

## 13. 验收用例（做到这些才算"完成"）
**必做线**
1. 陈老师登录 → 课表页显示自己的课；看不到刘老师的课
2. 陈老师对 AI 说"今天数学班小王到了，小李请假" → 出现**逐人点名预览**；此时出勤页**无变化** → 点确认 → 出勤页有 2 条记录、扣课记录 1 条（小王）；**再次点确认** → 不新增
3. 小王登录 → 学生课程页只显示自己的课
4. 小王问资料里有的问题 → 回答带引用；问"二次函数顶点公式" → 回复"暂时没有"
5. 刘老师登录 → 看不到陈老师的任何学生/课程；刘老师问 AI"小王这周的出勤" → 不返回数据
**从空数据开始（B 档前三项）**
6. 空库 → 陈老师说"新建周末数学小班，加小王和小李" → 预览 → 确认 → 课表页出现课程；学生邮箱未注册时给出明确提示
7. "给这个班下周二和周四各排一节 60 分钟" → 预览（含冲突结果）→ 确认 → 课表出现 2 节；冲突场次不写入并说明原因
8. 粘贴一段文字"建第一单元并加入" → 预览 → 确认 → 资料页出现；小王能就该资料提问
9. （加分）陈老师说"记一下小王周二周四下午不方便" → 预览 → 确认 → 之后说"给数学班排下周的课"，AI 排课避开该时段；小王登录问 AI "我的备注是什么"→ 不返回任何 memory

---

## 14. 变更记录（只追加）
| 时间 | 提出人 | 内容 | 确认 |
|---|---|---|---|
| H0 | Zachary | v0.4：新增 AgentMemory 表（Nick 只建表）、ADD_STUDENT_NOTE 提案、MemoryKind、验收用例 9、种子 memory 示例 | 待 |
| H0 | Zachary | v0.2：补返回类型、全部输入类型、权限表、确认规则、网址接口、面板集成、具体种子、验收用例；新增 `listMyCourses` | 待 |

## 15. 决定清单
**Zachary 已确认**
1. 时区：`America/Vancouver`
2. 点名必须覆盖全部已加入学生
3. **点名后不支持修改**（旷课改请假等为 P1，可在全部完成后作为独立小功能补做）
4. `createSessions` 有冲突整批不写，但必须按 §6.3 明确告知原因
5. 登录：★ 邮箱 + 密码（Auth.js 凭据登录）；Google / Passkey 为 P1

**待 Nick 在 H0 确认**
6. 新增 `listMyCourses`
7. CREATE_COURSE 部分成功不回滚（课程保留，逐邮箱列出失败项）
8. 全部服务函数返回 `Result<T>`（不抛异常）
9. 种子文件分工：`seed.ts`（账号）归 Nick，`seed-ai.ts`（完整演示数据）归 Zachary
10. 初始 schema 就包含 AgentRun、AgentProposal、AgentMemory 三张表（Nick 建表，不写函数）
