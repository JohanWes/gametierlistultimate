# Ultimate Game Tier List Generator

A premium, game-like webapp where a player builds a personalized **S–F tier list of the best games
they have played**, driven by quick ranking minigames instead of manual drag-and-drop. Anonymous and
shareable, designed mouse + touch first.

## Tech stack

Next.js (App Router) + TypeScript on Vercel · MongoDB · IGDB fallback search · Tailwind + Framer
Motion · Zustand state · Vitest + React Testing Library + Playwright for tests.

## Getting started

```bash
cp .env.example .env   # fill in MONGODB_URI, IGDB_CLIENT_ID, IGDB_CLIENT_SECRET
npm install
npm run dev
```

`.env` is git-ignored. The same three variables must be configured in Vercel for production. No
infrastructure beyond MongoDB + IGDB is required.
