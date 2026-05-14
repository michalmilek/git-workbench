# shadcn Generated Info

Date: 2026-05-14

The project uses the user-provided preset:

```bash
bunx --bun shadcn@latest apply --preset b6GMNXFsB --yes
```

The preset required initial project setup first:

```bash
bunx --bun shadcn@latest init --preset b6GMNXFsB --yes
```

Generated project facts from `bunx --bun shadcn@latest info --json`:

- Framework: Vite
- Tailwind: v4
- CSS entry: `src/styles.css`
- Style: `radix-mira`
- Primitive base: `radix`
- Icon library: `tabler`
- UI alias: `@/components/ui`
- Utils alias: `@/lib/utils`

`components.json` is the source of truth for component aliases, Tailwind setup, icon library, and primitive base. Engineers must inspect `bunx --bun shadcn@latest info --json` before adding components.
