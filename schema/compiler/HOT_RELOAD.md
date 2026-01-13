# Schema Hot Reload - Phase 2.3

**Phase 2.3: Hot Reload System** ✅ Complete (Development Features)

## Features

- ✅ File system watcher for schema changes
- ✅ Automatic recompilation on save
- ✅ Debounced updates (prevents rapid recompilations)
- ✅ Error handling and reporting
- ✅ CLI tool for development workflow
- ✅ Programmatic API for custom integrations
- ✅ Comprehensive test suite (6 tests)

## Usage

### CLI Watch Mode

Monitor a schema file and automatically recompile on changes:

```bash
cd schema/compiler
pnpm build

# Watch with default output directory (./generated)
node dist/watch-cli.js example.yaml

# Watch with custom output directory
node dist/watch-cli.js schema.yaml ./output
```

Output:
```
👀 Watching example.yaml for changes...
✅ Schema compiled successfully
   → generated/example.types.ts
   → generated/example.sql

📝 Schema file changed, recompiling...
✅ Schema compiled successfully
   → generated/example.types.ts
   → generated/example.sql
```

Stop watching with `Ctrl+C`.

### Programmatic API

```typescript
import { watchSchema, SchemaWatcher } from '@relish/schema-compiler';

// Simple usage
const watcher = watchSchema({
  inputFile: 'schema.yaml',
  outputDir: './generated',
  onCompile: (success, error) => {
    if (success) {
      console.log('Schema updated!');
    } else {
      console.error('Compilation failed:', error);
    }
  },
  debounce: 300 // milliseconds (optional, default: 300)
});

// Stop watching
watcher.stop();

// Advanced usage with custom options
const customWatcher = new SchemaWatcher({
  inputFile: 'schema.yaml',
  outputDir: './generated',
  onCompile: (success, error) => {
    if (success) {
      // Trigger hot reload in your app
      broadcastSchemaUpdate();
    }
  },
  debounce: 500
});

customWatcher.start();
```

## Features Implemented

### 1. File System Watcher

- Monitors schema files for changes using Node.js `fs.watch()`
- Automatically detects modifications
- Graceful shutdown on SIGINT/SIGTERM

### 2. Debouncing

- Prevents excessive recompilations during rapid edits
- Configurable debounce delay (default: 300ms)
- Only compiles once after changes settle

### 3. Error Handling

- Catches and reports compilation errors
- Continues watching after errors
- Provides detailed error messages
- Calls `onCompile` callback with error details

### 4. Development Workflow

```bash
# Terminal 1: Watch schema
schema-watch schema.yaml

# Terminal 2: Edit schema
vim schema.yaml

# Terminal 1: Auto-recompiles on save
📝 Schema file changed, recompiling...
✅ Schema compiled successfully
```

## Test Coverage

Six comprehensive tests:

1. ✅ Compile schema on start
2. ✅ Throw error if input file doesn't exist
3. ✅ Recompile on file change
4. ✅ Debounce rapid changes
5. ✅ Call onCompile with error on invalid schema
6. ✅ Stop watching when stop() is called

Run tests:
```bash
cd schema/compiler
pnpm test
```

## Integration Examples

### With Build Tools

```typescript
// vite.config.ts or similar
import { watchSchema } from '@relish/schema-compiler';

export default {
  plugins: [
    {
      name: 'schema-watcher',
      configureServer() {
        watchSchema({
          inputFile: 'schema.yaml',
          outputDir: './src/generated',
          onCompile: (success) => {
            if (success) {
              // Trigger HMR
              server.ws.send({ type: 'full-reload' });
            }
          }
        });
      }
    }
  ]
};
```

### With Custom Workflows

```typescript
import { watchSchema } from '@relish/schema-compiler';
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

watchSchema({
  inputFile: 'schema.yaml',
  outputDir: './generated',
  onCompile: (success) => {
    if (success) {
      // Notify all connected clients
      wss.clients.forEach(client => {
        client.send(JSON.stringify({ 
          type: 'schema-update',
          timestamp: Date.now()
        }));
      });
    }
  }
});
```

## Next Steps (Production Features)

The following features are planned for production-ready hot reload:

- [ ] Runtime schema updates in Durable Objects
- [ ] Schema versioning system
- [ ] Atomic schema activation
- [ ] Client synchronization protocol
- [ ] Rollback capabilities
- [ ] Migration validation
- [ ] Zero-downtime deployments

See [PHASE_2_SCHEMA_INFRASTRUCTURE.md](../../docs/multi-tenant-migration/details/PHASE_2_SCHEMA_INFRASTRUCTURE.md) for the full roadmap.

## Notes

- The file watcher uses Node.js `fs.watch()` which is platform-dependent
- Debouncing helps with editors that save multiple times
- The watcher automatically creates the output directory if it doesn't exist
- SIGINT (Ctrl+C) and SIGTERM are handled gracefully
