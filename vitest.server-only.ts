// Vitest stand-in for the "server-only" marker package. Next.js resolves it
// itself (and throws if a client bundle imports a server module); under Vitest
// there is no client bundle, so the marker is simply empty.
export {};
