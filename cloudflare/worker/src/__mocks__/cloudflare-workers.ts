/**
 * Mock for Cloudflare Workers DurableObject
 */
export class DurableObject {
  constructor(protected state: any, protected env: any) {}
}

export interface Env {
  // Define your env bindings here
}
