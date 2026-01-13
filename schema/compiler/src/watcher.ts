/**
 * Schema File Watcher
 * 
 * Phase 2.3: Hot Reload System
 * 
 * Watches schema files for changes and automatically recompiles them
 */

import { watch } from 'fs';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { compile } from './index.js';

export interface WatcherOptions {
  inputFile: string;
  outputDir: string;
  onCompile?: (success: boolean, error?: Error) => void;
  debounce?: number;
}

export class SchemaWatcher {
  private watcher?: ReturnType<typeof watch>;
  private debounceTimer?: NodeJS.Timeout;

  constructor(private options: WatcherOptions) {
    this.options.debounce = options.debounce || 300; // 300ms default debounce
  }

  start(): void {
    const { inputFile } = this.options;

    if (!existsSync(inputFile)) {
      throw new Error(`Schema file not found: ${inputFile}`);
    }

    console.log(`👀 Watching ${inputFile} for changes...`);

    // Initial compilation
    this.compileSchema();

    // Watch for changes
    this.watcher = watch(inputFile, (eventType) => {
      if (eventType === 'change') {
        this.handleChange();
      }
    });
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      console.log('🛑 Stopped watching schema file');
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }

  private handleChange(): void {
    // Debounce rapid changes
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      console.log('📝 Schema file changed, recompiling...');
      this.compileSchema();
    }, this.options.debounce);
  }

  private compileSchema(): void {
    const { inputFile, outputDir, onCompile } = this.options;

    try {
      // Read input file
      const content = readFileSync(inputFile, 'utf-8');
      const format = inputFile.endsWith('.json') ? 'json' : 'yaml';

      // Compile schema
      const output = compile(content, format);

      // Create output directory
      mkdirSync(outputDir, { recursive: true });

      // Write output files
      const baseName = basename(inputFile, format === 'json' ? '.json' : '.yaml');
      
      writeFileSync(join(outputDir, `${baseName}.types.ts`), output.types);
      writeFileSync(join(outputDir, `${baseName}.sql`), output.sql);

      console.log('✅ Schema compiled successfully');
      console.log(`   → ${join(outputDir, `${baseName}.types.ts`)}`);
      console.log(`   → ${join(outputDir, `${baseName}.sql`)}`);

      if (onCompile) {
        onCompile(true);
      }
    } catch (error) {
      console.error('❌ Compilation failed:', (error as Error).message);
      if (onCompile) {
        onCompile(false, error as Error);
      }
    }
  }
}

/**
 * Start watching a schema file
 */
export function watchSchema(options: WatcherOptions): SchemaWatcher {
  const watcher = new SchemaWatcher(options);
  watcher.start();
  return watcher;
}
