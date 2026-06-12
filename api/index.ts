// Vercel serverless entrypoint: serves ONLY the stateless HTTP surface
// (OAuth callbacks + health check). The Slack bot itself runs as a long-lived
// Socket Mode process elsewhere (local dev / VPS) — Vercel cannot host it.
// Both sides share the same Supabase database and TOKEN_ENCRYPTION_KEY.
import { createStandaloneServer } from '../src/app';

export default createStandaloneServer();
