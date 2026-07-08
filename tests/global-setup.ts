import { execSync } from "node:child_process";

// Reset the local database to a known, seeded state before the e2e run so
// every run is deterministic (fresh users, no leftover projects/comments).
export default function globalSetup() {
  console.log("[e2e] resetting local database…");
  execSync("npm run db:reset", { stdio: "inherit" });
}
