# Cline Quick Start Guide

**Last Updated**: 2026-10-09  
**Status**: ✅ Production Ready

## 🚀 Getting Started (5 minutes)

### 1. Restart VS Code
Close and reopen VS Code to load the new Cline configuration.

### 2. Open Cline Panel
Click the Cline icon in the VS Code sidebar (or press `Cmd+Shift+P` → "Cline: Focus on Cline View").

### 3. Test Your First Workflow
Type in Cline chat:
```
/db-check
```

If you see a database connection report, you're all set! 🎉

## 📋 Essential Workflows

| Command | What It Does | When to Use |
|---------|-------------|-------------|
| `/commit` | Smart commit with checks | After making code changes |
| `/review` | Full code review | Before pushing to remote |
| `/security` | Security audit | Before deploying, touching auth/payment code |
| `/db-check` | Database health check | Troubleshooting DB issues |
| `/perf` | Performance audit | Optimizing React/Next.js performance |
| `/new-page` | Scaffold new dashboard page | Creating new MTMS features |

## 🎯 Common Tasks

### Writing Code
Just describe what you want:
```
Create a new API endpoint for fetching user transactions with pagination
```

Cline will:
1. Check `.agents/skills/` for relevant patterns
2. Follow `.cline/rules/` for coding standards
3. Write tests (TDD workflow)
4. Format with Biome
5. Type-check with TypeScript

### Code Review
After writing code:
```
/review src/app/(DashboardLayout)/apps/transactions/
```

### Creating a New Page
```
/new-page inventory-reports "Inventory reports with charts and filters"
```

### Security Check
Before committing sensitive code:
```
/security
```

## 📚 Documentation

| Document | Purpose | Read When |
|----------|---------|-----------|
| **CLINE.md** | Complete guide | Setting up, learning workflows |
| **MIGRATION.md** | Migration details | Team onboarding, troubleshooting |
| **.cline/README.md** | Quick reference | Daily reminder of structure |
| **bispro.md** | Business process | Working on inventory/transactions |

## 🔧 Configuration Files

### What's Committed (Team Shared)
- `.cline/rules/` - 28 coding standards
- `.cline/workflows/` - 6 slash commands
- `.agents/skills/` - 203 reusable skills
- `CLINE.md`, `MIGRATION.md` - Documentation
- `bispro.md` - Business process (MANDATORY)

### What's Ignored (Local Only)
- `.cline/data/` - Your session data
- `.archive/` - Backup of old configs

## 🎨 Available Skills

Cline auto-discovers 203 skills in `.agents/skills/`. Key categories:

| Category | Skills | Use For |
|----------|--------|---------|
| **UI/UX** | `ui-ux-pro-max`, `hallmark` | Component design, color palettes, typography |
| **Architecture** | `clean-code`, `clean-architecture`, `ddd` | Code structure, refactoring |
| **Security** | `cybersecurity`, `secops-*`, `testing-*` | Security audits, penetration testing |
| **MTMS** | `mtms-create-page`, `mtms-change-branding` | MTMS-specific workflows |
| **Frameworks** | `nextjs-patterns`, `react-patterns`, etc. | Framework-specific guidance |

## 🤖 Specialized Agents

Cline can delegate to 68 specialized agents:

| Agent | Purpose | Invoke Via |
|-------|---------|-----------|
| `planner` | Implementation planning | "Plan how to implement X" |
| `architect` | System design | "Design architecture for X" |
| `tdd-guide` | Test-driven development | "Write tests first for X" |
| `code-reviewer` | Code review | `/review` workflow |
| `security-reviewer` | Security audit | `/security` workflow |
| `build-error-resolver` | Fix build errors | "Build is failing" |

## 🔍 Troubleshooting

### Workflow not found?
Restart VS Code. Workflows are loaded on startup.

### Database connection failed?
Check MCP configuration:
```bash
cat ~/.cline/data/settings/cline_mcp_settings.json
```

Re-run setup if needed:
```bash
./setup-cline-mcp.sh
```

### TypeScript errors?
```bash
pnpm tsc --noEmit
```

### Biome/linting errors?
```bash
pnpm dlx @biomejs/biome check --write .
```

## 💡 Pro Tips

### 1. Start with Planning
For complex features, ask Cline to create a plan first:
```
Plan the implementation for a new inventory reconciliation module
```

### 2. Use Business Process as Context
When working on inventory/transactions:
```
Read bispro.md and implement the Return Material flow with validation
```

### 3. Leverage Skills
Don't reinvent the wheel:
```
Use the ui-ux-pro-max skill to design a dashboard card component with the neo-brutalism style
```

### 4. Chain Workflows
```
/new-page → write code → /review → /security → /commit
```

### 5. Ask for Explanations
```
Explain the status flow for InOut Tag transactions based on bispro.md
```

## 🆘 Need Help?

### Read Documentation
1. **CLINE.md** - Full configuration guide
2. **MIGRATION.md** - Troubleshooting & FAQ
3. **.cline/README.md** - Structure overview

### Check Examples
Look at existing pages for patterns:
```
src/app/(DashboardLayout)/apps/transactions/
src/app/(DashboardLayout)/apps/warehouse/
```

### Ask Cline
Just describe your problem:
```
I'm getting a TypeScript error in my component. Here's the code: [paste]
```

## 🎯 Quick Commands Cheat Sheet

```bash
# Development
pnpm dev                # Start dev server
pnpm build              # Production build
pnpm tsc --noEmit       # Type check
pnpm dlx @biomejs/biome check --write .  # Lint & format

# Database
./setup-cline-mcp.sh    # Configure MCP
psql -h $DB_HOST -U $DB_USER -d $DB_NAME  # Direct DB access

# Git
git status              # Check changes
git add .               # Stage all
git commit -m "..."     # Commit (or use /commit)
git push                # Push to remote
```

## 🌟 Key Differences from Roo

| Aspect | Roo | Cline |
|--------|-----|-------|
| **Modes** | 9 custom modes | Workflows (slash commands) |
| **Commands** | `.roo/commands/` | `.cline/workflows/` |
| **Invocation** | Mode switching | `/workflow-name` |
| **Rules** | Scattered | Organized in `.cline/rules/` |
| **Skills** | External | Auto-discovered from `.agents/skills/` |
| **MCP** | `.roo/mcp.json` | `~/.cline/data/settings/cline_mcp_settings.json` |

## ✅ Success Checklist

- [ ] VS Code restarted
- [ ] Cline panel opened
- [ ] `/db-check` works
- [ ] `/review` tested on a file
- [ ] Read `CLINE.md`
- [ ] Team notified (share `MIGRATION.md`)
- [ ] Old configs backed up (`.archive/`)

## 🎉 You're Ready!

Start coding with Cline. Remember:
1. **Describe** what you want to build
2. **Let Cline** handle the implementation details
3. **Review** with `/review` before committing
4. **Secure** with `/security` for sensitive code
5. **Commit** with `/commit` for smart commits

Happy coding! 🚀

---

**Migration Date**: 2026-10-09  
**Performed By**: Kiro AI  
**Status**: ✅ Complete and Production Ready
