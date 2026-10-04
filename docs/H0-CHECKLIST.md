# H0 Checklist (first 30 minutes, in order)

## Before the competition / opening ceremony (Zachary)
- [ ] Record the submission deadline, judging time, required theme or track, and rules for AI tools and prewritten code.
- [ ] Spend 10 minutes deciding how to adapt to the theme: proceed if compatible / reskin by changing only `domain/edu/` (1–3 hours) / keep only the AI core.

## Local environment (each person)
- [ ] Install Docker Desktop and confirm `docker --version` prints a version.
- [ ] Pull images in advance: `docker pull postgres:17` and `docker pull node:22-slim`.
- [ ] Have Node 22, Git, and VS Code ready. Put the DeepSeek key in the local `.env` file (never in Git).
- [ ] Keep a phone hotspot available as a backup.

## Repository (Nick creates it; Zachary clones it)
- [ ] Create a public GitHub repository and add the files from the ZIP: `CLAUDE.md`, `docs/*`, `.gitignore`, `.prettierrc`, `.env.example`, `Dockerfile`, and `docker-compose.yml`.
- [ ] Commit `.gitignore` and `.prettierrc` first, then commit the remaining files. Confirm `.env` is not staged before running `git add`.
- [ ] Create the `nick/core` and `zachary/ai-agent` branches.
- [ ] Review the items marked "Pending Nick's confirmation" in §15 (items 6–10) of `docs/api-contract.md`. Freeze them after agreement and record the decision in §14.

## Start work
- [ ] Each person gives their AI the relevant opening prompt from `docs/PROMPTS.md`.
- [ ] Nick starts N1; Zachary starts S1.
- [ ] Push about every 30 minutes. Pause and coordinate at the H3 and H6 checkpoints.
