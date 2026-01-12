// Type declarations for kuzu-wasm
declare module "kuzu-wasm" {
  export class KuzuDatabase {
    constructor(path: string, bufferPoolSize?: number, options?: any);
    close(): Promise<void>;
  }

  export class KuzuConnection {
    constructor(database: KuzuDatabase);
    query(query: string): Promise<KuzuQueryResult>;
    close(): Promise<void>;
  }

  export class KuzuQueryResult {
    hasNext(): boolean;
    getNext(): any;
    getColumns(): string[];
    resetIterator(): void;
    close(): void;
  }

  export function initKuzu(): Promise<void>;
}

declare global {
  interface Window {
    kuzu: any;
  }
}

export {};
