/**
 * True when the app runs on the real database-backed services (Next.js development or production).
 * Plain `tsx` check scripts have no NODE_ENV, so they use the in-memory fake services and stores.
 */
export const useRealBackend =
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "production";
