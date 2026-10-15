// ==========================================
// Shared setup for every storefront test.
//
// Two jobs, both about isolation:
//
//   * No test may reach the network. `fetch` is replaced with a stub that
//     THROWS rather than one that returns a benign empty response — a test
//     that forgets to mock an endpoint should fail loudly on the spot, not
//     quietly exercise the component's error path and look like it passed.
//
//   * The sign-in screen persists across reloads on purpose (a challenge in
//     sessionStorage, the session in localStorage). That persistence is the
//     thing several tests assert on, so it has to be wiped between them or
//     one test's live challenge resumes inside the next one.
// ==========================================
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      throw new Error(
        `Unmocked network request to ${String(input)} — mock it in the test, ` +
          'tests must never reach a real endpoint.'
      );
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
  localStorage.clear();
  sessionStorage.clear();
});
