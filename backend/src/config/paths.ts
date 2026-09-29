import fs from 'fs';
import path from 'path';

/**
 * Filesystem layout of the monorepo, resolved once at startup.
 *
 * The repo root is found by walking up from the working directory until a
 * folder containing both `frontend/` and `admin/` appears, because the working
 * directory legitimately differs between `npm run dev` (cwd = backend/),
 * `npm start` from the root, and pm2 (whatever `cwd` the ecosystem file sets).
 *
 * Deriving it from `__dirname` is not an option: this code runs as ESM under
 * tsx in development and as a bundled CJS file in production, and those two
 * disagree about what `__dirname` even is.
 */
function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'frontend')) && fs.existsSync(path.join(dir, 'admin'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate the Glamirk repo root from ${process.cwd()} — expected an ancestor containing frontend/ and admin/.`
  );
}

export const REPO_ROOT = findRepoRoot();

export const PATHS = {
  root: REPO_ROOT,
  envFile: path.join(REPO_ROOT, '.env'),
  frontendRoot: path.join(REPO_ROOT, 'frontend'),
  frontendDist: path.join(REPO_ROOT, 'frontend', 'dist'),
  adminRoot: path.join(REPO_ROOT, 'admin'),
  adminDist: path.join(REPO_ROOT, 'admin', 'dist'),
  migrations: path.join(REPO_ROOT, 'database', 'migrations'),
  seeds: path.join(REPO_ROOT, 'database', 'seeds'),
} as const;
