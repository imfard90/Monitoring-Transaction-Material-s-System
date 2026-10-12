---
paths:
  - "**/*.css"
  - "**/*.scss"
  - "**/*.sass"
  - "**/*.less"
  - "**/*.html"
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
---
> This file extends [common/hooks.md](common-hooks.md) with web-specific frontend quality recommendations.

# Web Quality Tooling & Verification

## Recommended Verification Commands

MTMS relies on project-local tooling (`Biome` and `tsc`). Do not wire commands to remote one-off packages or uninstalled tools (such as Prettier, ESLint, or Stylelint).

### Format on Save / Verification
Use the project's existing Biome formatter:
```bash
pnpm format
# or: pnpm exec biome format --write <file>
```

### Lint Check
Use Biome for static linting, import organization, and accessibility audits:
```bash
pnpm lint
# or: pnpm check
```

### Type Check
Run project-wide static type checking:
```bash
pnpm tsc --noEmit
```

### Build Verification
Before concluding large features or releases, ensure the Next.js production bundle succeeds:
```bash
pnpm build
```

## Recommended Verification Order

1. **Format**: `pnpm format`
2. **Lint**: `pnpm lint`
3. **Type Check**: `pnpm tsc --noEmit`
4. **Test**: `pnpm test:unit`
5. **Build Verification**: `pnpm build` (on release/major updates)
