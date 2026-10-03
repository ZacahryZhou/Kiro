# H0 检查清单（开工前 30 分钟，按顺序）

## 比赛前/开幕式（Zachary）
- [ ] 记下：提交截止时间、评审时间、是否有强制主题/赛道、AI 工具和预写代码规则
- [ ] 主题适配 10 分钟决定：不冲突照做 / 换皮（只改 `domain/edu/`，1–3h）/ 只保留 AI 核心

## 本机环境（两人各自）
- [ ] 装好 Docker Desktop，`docker --version` 有输出
- [ ] 提前拉镜像：`docker pull postgres:17`、`docker pull node:22-slim`
- [ ] Node 22、Git、VSCode 就绪；DeepSeek key 放进本机 `.env`（不进 Git）
- [ ] 手机热点备用

## 仓库（Nick 建，Zachary 拉）
- [ ] 建 GitHub 仓库（公开），把 zip 里的文件放进去：`CLAUDE.md`、`docs/*`、`.gitignore`、`.prettierrc`、`.env.example`、`Dockerfile`、`docker-compose.yml`
- [ ] 先提交 `.gitignore`、`.prettierrc`，再提交其他文件（git add 前确认没有 `.env`）
- [ ] 建分支：`nick/core`、`zachary/ai-agent`
- [ ] 两人核对 `docs/api-contract.md` 的"待 Nick 确认"项（§15 的 6–10），确认后冻结，在 §14 记一条

## 开工
- [ ] 各自把"开场 prompt"（docs/PROMPTS.md）贴给自己的 AI
- [ ] Nick 开始 N1，Zachary 开始 S1
- [ ] 每约 30 分钟 push；H3、H6 检查点停下来对一次
