# Instructions for AI coding assistants

This is a live ordering site for real customers. Before changing anything:

1. Read `RUNBOOK.md` in this folder.
2. The domain is sillitosourdough.**org**. The .com is not registered; never use it.
3. This is the live repo. Don't touch `S:\projects\side\websites\sillito-sourdough-2025` (the old version).
4. The git remote is `Sillito-Sourdough-Landing-Page`, not `origin`. Pushing to `master` deploys to production on Vercel.
5. Static HTML + `api/*.js` serverless functions, no build step, no npm dependencies. Check edited JS with `node --check <file>`.
6. Production env vars live in the Vercel dashboard, not the local `.env`. Never read, print, or commit `.env`.
7. Make the smallest change that does the job. If you change how something works, update `RUNBOOK.md` in the same commit.
