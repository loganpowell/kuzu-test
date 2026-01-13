import { useSchemaStore } from './store/schema-store';
import { Button } from './components/ui/button';
import { Plus } from 'lucide-react';

function App() {
  const { schema, addEntity, selectedEntityId } = useSchemaStore();

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="flex h-16 items-center justify-between px-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Schema Editor</h1>
            <p className="text-sm text-muted-foreground">
              Design your authorization schema visually
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">
              Save Draft
            </Button>
            <Button>
              Publish Schema
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Entity List */}
        <aside className="w-64 border-r border-border bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Entities</h2>
            <Button 
              size="icon" 
              variant="ghost"
              onClick={() => addEntity(`Entity${schema.entities.length + 1}`)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-2">
            {schema.entities.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No entities yet. Click + to add one.
              </p>
            ) : (
              schema.entities.map((entity) => (
                <div
                  key={entity.id}
                  className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                    selectedEntityId === entity.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-accent'
                  }`}
                >
                  <div className="font-medium">{entity.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {entity.fields.length} fields
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Center - Canvas */}
        <main className="flex-1 bg-muted/20 p-8">
          <div className="flex h-full items-center justify-center rounded-lg border-2 border-dashed border-border bg-card">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-foreground">Schema Canvas</h3>
              <p className="text-sm text-muted-foreground">
                Drag-and-drop editor coming soon...
              </p>
              <p className="mt-4 text-xs text-muted-foreground">
                Entities: {schema.entities.length} | Relationships: {schema.relationships.length}
              </p>
            </div>
          </div>
        </main>

        {/* Right Sidebar - Property Editor */}
        <aside className="w-80 border-l border-border bg-card p-4">
          <h2 className="mb-4 text-lg font-semibold">Properties</h2>
          {selectedEntityId ? (
            <div>
              <p className="text-sm text-muted-foreground">
                Selected entity properties will appear here
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select an entity to edit its properties
            </p>
          )}
        </aside>
      </div>

      {/* Bottom Panel - Code Preview */}
      <div className="border-t border-border bg-card">
        <div className="flex h-12 items-center justify-between px-6">
          <h3 className="text-sm font-semibold">Generated Code</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost">TypeScript</Button>
            <Button size="sm" variant="ghost">SQL</Button>
            <Button size="sm" variant="ghost">YAML</Button>
          </div>
        </div>
        <div className="h-48 bg-muted/30 p-4">
          <pre className="text-xs text-muted-foreground">
            {JSON.stringify(schema, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default App;
