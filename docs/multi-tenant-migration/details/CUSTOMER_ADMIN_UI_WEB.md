# Customer Admin UI - Web

**Component:** Task 2.4 of Phase 2 (Schema Infrastructure)  
**Status:** ⏳ Not Started (0%)  
**Duration:** 2-3 weeks  
**Dependencies:** Schema Compiler (2.2), Hot Reload System (2.3)

---

## 🎯 Goal

Build a **visual schema editor** for tenant administrators to manage their authorization schemas without writing code.

**Target User:** Customer admin/developer who needs to customize their authorization model.

**Key Innovation:** Drag-and-drop entity creation + live TypeScript preview = **3-minute schema updates** (vs 2-4 hours of manual coding).

---

## 📊 Progress Tracking

| Component                           | Status             | Progress |
| ----------------------------------- | ------------------ | -------- |
| 2.4.1 Project Setup                 | ⏳ Not Started     | 0%       |
| 2.4.2 Schema Canvas (Drag-and-Drop) | ⏳ Not Started     | 0%       |
| 2.4.3 Entity Editor Panel           | ⏳ Not Started     | 0%       |
| 2.4.4 Field Configuration           | ⏳ Not Started     | 0%       |
| 2.4.5 Code Preview (Monaco)         | ⏳ Not Started     | 0%       |
| 2.4.6 Version Management            | ⏳ Not Started     | 0%       |
| 2.4.7 Validation & Error Display    | ⏳ Not Started     | 0%       |
| 2.4.8 Schema Activation             | ⏳ Not Started     | 0%       |
| 2.4.9 Deploy to Cloudflare Pages    | ⏳ Not Started     | 0%       |
| **Overall**                         | **⏳ Not Started** | **0%**   |

---

## 🏗️ Architecture

### Tech Stack

```yaml
Framework: Next.js 14 (App Router)
Language: TypeScript
UI Library: shadcn/ui (Radix UI primitives)
Drag-and-Drop: @dnd-kit/core
Code Editor: Monaco Editor (VS Code engine)
State Management: Zustand
Forms: React Hook Form + Zod
Styling: Tailwind CSS
Deployment: Cloudflare Pages (via Pulumi)
```

### Component Hierarchy

```
App Layout
├── Sidebar (navigation)
├── Schema Canvas (main editor)
│   ├── Entity Nodes (draggable)
│   ├── Relationship Lines
│   └── Add Entity Button
├── Entity Editor Panel (right side)
│   ├── Entity Name Input
│   ├── Field List
│   │   ├── Field Row (name, type, constraints)
│   │   └── Add Field Button
│   └── Save/Cancel Actions
├── Code Preview Panel (bottom)
│   ├── Monaco Editor (read-only)
│   ├── Tab Selector (Types, Validators, Loaders)
│   └── Copy Button
└── Version Management Modal
    ├── Version List
    ├── Diff Viewer
    └── Activate/Rollback Buttons
```

### Data Flow

```
User Action → Zustand Store → Schema AST → Schema Compiler (API) → Generated Code → Monaco Preview
                                                                  → Hot Reload → Client Sync
```

---

## 📋 Task List

### 2.4.1 Project Setup (Day 1)

#### Tasks

- [ ] **Create Next.js project**

  ```bash
  cd admin-ui
  npx create-next-app@latest customer-admin \
    --typescript \
    --tailwind \
    --app \
    --no-src-dir
  cd customer-admin
  ```

- [ ] **Install dependencies**

  ```bash
  npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
  npm install zustand
  npm install react-hook-form zod @hookform/resolvers
  npm install @monaco-editor/react
  npm install lucide-react
  npm install recharts
  npx shadcn-ui@latest init
  ```

- [ ] **Add shadcn/ui components**

  ```bash
  npx shadcn-ui@latest add button
  npx shadcn-ui@latest add input
  npx shadcn-ui@latest add select
  npx shadcn-ui@latest add dialog
  npx shadcn-ui@latest add tabs
  npx shadcn-ui@latest add card
  npx shadcn-ui@latest add badge
  npx shadcn-ui@latest add toast
  npx shadcn-ui@latest add dropdown-menu
  ```

- [ ] **Setup directory structure**

  ```
  customer-admin/
  ├── app/
  │   ├── layout.tsx
  │   ├── page.tsx
  │   ├── schema/
  │   │   ├── page.tsx           # Schema editor
  │   │   └── versions/page.tsx  # Version history
  │   └── api/
  │       └── schema/
  │           ├── upload/route.ts
  │           ├── validate/route.ts
  │           └── versions/route.ts
  ├── components/
  │   ├── schema-canvas.tsx
  │   ├── entity-node.tsx
  │   ├── entity-editor-panel.tsx
  │   ├── field-editor.tsx
  │   ├── code-preview.tsx
  │   ├── version-manager.tsx
  │   └── validation-errors.tsx
  ├── lib/
  │   ├── store.ts              # Zustand store
  │   ├── schema-types.ts       # Schema AST types
  │   ├── schema-api.ts         # API client
  │   └── validation.ts         # Client-side validation
  └── public/
  ```

- [ ] **Configure environment variables**
  ```bash
  # .env.local
  NEXT_PUBLIC_WORKER_URL=http://localhost:8787
  NEXT_PUBLIC_TENANT_ID=tenant-demo
  ```

#### Acceptance Criteria

- ✅ Next.js project running on `localhost:3000`
- ✅ All dependencies installed
- ✅ Directory structure created
- ✅ Environment variables configured

---

### 2.4.2 Schema Canvas (Drag-and-Drop) (Days 2-3)

#### Tasks

- [ ] **Create Zustand store** (`lib/store.ts`)

  ```typescript
  import { create } from "zustand";

  interface Entity {
    id: string;
    name: string;
    position: { x: number; y: number };
    fields: Field[];
  }

  interface Field {
    id: string;
    name: string;
    type: "string" | "number" | "boolean" | "reference" | "array";
    required: boolean;
    unique: boolean;
    referenceType?: string;
  }

  interface SchemaStore {
    entities: Entity[];
    relationships: Relationship[];
    selectedEntityId: string | null;

    addEntity: (entity: Entity) => void;
    updateEntity: (id: string, updates: Partial<Entity>) => void;
    deleteEntity: (id: string) => void;
    selectEntity: (id: string | null) => void;

    addField: (entityId: string, field: Field) => void;
    updateField: (
      entityId: string,
      fieldId: string,
      updates: Partial<Field>
    ) => void;
    deleteField: (entityId: string, fieldId: string) => void;
  }

  export const useSchemaStore = create<SchemaStore>((set) => ({
    entities: [],
    relationships: [],
    selectedEntityId: null,

    addEntity: (entity) =>
      set((state) => ({ entities: [...state.entities, entity] })),

    updateEntity: (id, updates) =>
      set((state) => ({
        entities: state.entities.map((e) =>
          e.id === id ? { ...e, ...updates } : e
        ),
      })),

    deleteEntity: (id) =>
      set((state) => ({
        entities: state.entities.filter((e) => e.id !== id),
        selectedEntityId:
          state.selectedEntityId === id ? null : state.selectedEntityId,
      })),

    selectEntity: (id) => set({ selectedEntityId: id }),

    addField: (entityId, field) =>
      set((state) => ({
        entities: state.entities.map((e) =>
          e.id === entityId ? { ...e, fields: [...e.fields, field] } : e
        ),
      })),

    updateField: (entityId, fieldId, updates) =>
      set((state) => ({
        entities: state.entities.map((e) =>
          e.id === entityId
            ? {
                ...e,
                fields: e.fields.map((f) =>
                  f.id === fieldId ? { ...f, ...updates } : f
                ),
              }
            : e
        ),
      })),

    deleteField: (entityId, fieldId) =>
      set((state) => ({
        entities: state.entities.map((e) =>
          e.id === entityId
            ? { ...e, fields: e.fields.filter((f) => f.id !== fieldId) }
            : e
        ),
      })),
  }));
  ```

- [ ] **Create Schema Canvas** (`components/schema-canvas.tsx`)

  ```typescript
  "use client";

  import {
    DndContext,
    DragEndEvent,
    useSensor,
    useSensors,
    PointerSensor,
  } from "@dnd-kit/core";
  import { useSchemaStore } from "@/lib/store";
  import { EntityNode } from "./entity-node";
  import { Button } from "@/components/ui/button";
  import { Plus } from "lucide-react";

  export function SchemaCanvas() {
    const { entities, updateEntity, addEntity } = useSchemaStore();

    const sensors = useSensors(
      useSensor(PointerSensor, {
        activationConstraint: { distance: 5 },
      })
    );

    const handleDragEnd = (event: DragEndEvent) => {
      const { active, delta } = event;
      const entity = entities.find((e) => e.id === active.id);

      if (entity) {
        updateEntity(entity.id, {
          position: {
            x: entity.position.x + delta.x,
            y: entity.position.y + delta.y,
          },
        });
      }
    };

    const handleAddEntity = () => {
      const newEntity = {
        id: `entity-${Date.now()}`,
        name: "NewEntity",
        position: { x: 100, y: 100 },
        fields: [],
      };
      addEntity(newEntity);
    };

    return (
      <div className="relative w-full h-full bg-slate-50">
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          {entities.map((entity) => (
            <EntityNode key={entity.id} entity={entity} />
          ))}
        </DndContext>

        <Button
          onClick={handleAddEntity}
          className="absolute bottom-4 right-4"
          size="lg"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Entity
        </Button>
      </div>
    );
  }
  ```

- [ ] **Create Entity Node** (`components/entity-node.tsx`)

  ```typescript
  "use client";

  import { useDraggable } from "@dnd-kit/core";
  import { useSchemaStore } from "@/lib/store";
  import { Card } from "@/components/ui/card";
  import { Badge } from "@/components/ui/badge";
  import { GripVertical } from "lucide-react";

  interface EntityNodeProps {
    entity: {
      id: string;
      name: string;
      position: { x: number; y: number };
      fields: any[];
    };
  }

  export function EntityNode({ entity }: EntityNodeProps) {
    const { selectEntity, selectedEntityId } = useSchemaStore();
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
      id: entity.id,
    });

    const style = transform
      ? {
          transform: `translate3d(${entity.position.x + transform.x}px, ${
            entity.position.y + transform.y
          }px, 0)`,
        }
      : {
          transform: `translate3d(${entity.position.x}px, ${entity.position.y}px, 0)`,
        };

    const isSelected = selectedEntityId === entity.id;

    return (
      <Card
        ref={setNodeRef}
        style={style}
        className={`absolute w-64 cursor-pointer transition-shadow ${
          isSelected ? "ring-2 ring-blue-500 shadow-lg" : ""
        }`}
        onClick={() => selectEntity(entity.id)}
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-lg">{entity.name}</h3>
            <div {...listeners} {...attributes}>
              <GripVertical className="h-5 w-5 text-gray-400 cursor-move" />
            </div>
          </div>

          <div className="space-y-1">
            {entity.fields.map((field) => (
              <div
                key={field.id}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-gray-700">{field.name}</span>
                <Badge variant="outline">{field.type}</Badge>
              </div>
            ))}
            {entity.fields.length === 0 && (
              <p className="text-sm text-gray-400 italic">No fields yet</p>
            )}
          </div>
        </div>
      </Card>
    );
  }
  ```

#### Acceptance Criteria

- ✅ Entities render on canvas
- ✅ Drag-and-drop working
- ✅ Entity selection working
- ✅ Add entity button working
- ✅ Entity position persisted

---

### 2.4.3 Entity Editor Panel (Days 4-5)

- [ ] **Create Entity Editor Panel** (`components/entity-editor-panel.tsx`)

  ```typescript
  "use client";

  import { useSchemaStore } from "@/lib/store";
  import { Input } from "@/components/ui/input";
  import { Button } from "@/components/ui/button";
  import { Label } from "@/components/ui/label";
  import { FieldEditor } from "./field-editor";
  import { Plus, Trash2 } from "lucide-react";

  export function EntityEditorPanel() {
    const { entities, selectedEntityId, updateEntity, deleteEntity, addField } =
      useSchemaStore();

    const selectedEntity = entities.find((e) => e.id === selectedEntityId);

    if (!selectedEntity) {
      return (
        <div className="w-80 border-l bg-white p-6">
          <p className="text-gray-400 text-center">Select an entity to edit</p>
        </div>
      );
    }

    const handleAddField = () => {
      const newField = {
        id: `field-${Date.now()}`,
        name: "newField",
        type: "string" as const,
        required: false,
        unique: false,
      };
      addField(selectedEntity.id, newField);
    };

    return (
      <div className="w-80 border-l bg-white p-6 overflow-y-auto">
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Edit Entity</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteEntity(selectedEntity.id)}
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>

            <Label htmlFor="entity-name">Entity Name</Label>
            <Input
              id="entity-name"
              value={selectedEntity.name}
              onChange={(e) =>
                updateEntity(selectedEntity.id, { name: e.target.value })
              }
              className="mt-1"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Fields</Label>
              <Button variant="outline" size="sm" onClick={handleAddField}>
                <Plus className="h-3 w-3 mr-1" />
                Add Field
              </Button>
            </div>

            <div className="space-y-2">
              {selectedEntity.fields.map((field) => (
                <FieldEditor
                  key={field.id}
                  entityId={selectedEntity.id}
                  field={field}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
  ```

---

### 2.4.4 Field Configuration (Days 5-6)

- [ ] **Create Field Editor** (`components/field-editor.tsx`)

  ```typescript
  "use client";

  import { useSchemaStore } from "@/lib/store";
  import { Input } from "@/components/ui/input";
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from "@/components/ui/select";
  import { Checkbox } from "@/components/ui/checkbox";
  import { Button } from "@/components/ui/button";
  import { Label } from "@/components/ui/label";
  import { Trash2 } from "lucide-react";

  export function FieldEditor({ entityId, field }: any) {
    const { updateField, deleteField, entities } = useSchemaStore();

    return (
      <div className="border rounded-lg p-3 space-y-3">
        <div className="flex items-center justify-between">
          <Input
            value={field.name}
            onChange={(e) =>
              updateField(entityId, field.id, { name: e.target.value })
            }
            className="flex-1 mr-2"
            placeholder="Field name"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => deleteField(entityId, field.id)}
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>

        <Select
          value={field.type}
          onValueChange={(value) =>
            updateField(entityId, field.id, { type: value })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="string">String</SelectItem>
            <SelectItem value="number">Number</SelectItem>
            <SelectItem value="boolean">Boolean</SelectItem>
            <SelectItem value="reference">Reference</SelectItem>
            <SelectItem value="array">Array</SelectItem>
          </SelectContent>
        </Select>

        {field.type === "reference" && (
          <Select
            value={field.referenceType}
            onValueChange={(value) =>
              updateField(entityId, field.id, { referenceType: value })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select entity" />
            </SelectTrigger>
            <SelectContent>
              {entities.map((entity) => (
                <SelectItem key={entity.id} value={entity.name}>
                  {entity.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id={`${field.id}-required`}
              checked={field.required}
              onCheckedChange={(checked) =>
                updateField(entityId, field.id, { required: checked })
              }
            />
            <Label htmlFor={`${field.id}-required`} className="text-sm">
              Required
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id={`${field.id}-unique`}
              checked={field.unique}
              onCheckedChange={(checked) =>
                updateField(entityId, field.id, { unique: checked })
              }
            />
            <Label htmlFor={`${field.id}-unique`} className="text-sm">
              Unique
            </Label>
          </div>
        </div>
      </div>
    );
  }
  ```

---

### 2.4.5 Code Preview (Monaco) (Days 7-8)

- [ ] **Create Code Preview** (`components/code-preview.tsx`)

  ```typescript
  "use client";

  import { useState, useEffect } from "react";
  import Editor from "@monaco-editor/react";
  import { useSchemaStore } from "@/lib/store";
  import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
  } from "@/components/ui/tabs";
  import { Button } from "@/components/ui/button";
  import { Copy } from "lucide-react";
  import { useToast } from "@/components/ui/use-toast";

  export function CodePreview() {
    const { entities } = useSchemaStore();
    const { toast } = useToast();
    const [code, setCode] = useState({
      types: "",
      validators: "",
      loaders: "",
    });

    useEffect(() => {
      // Generate TypeScript types
      const typesCode = generateTypes(entities);
      const validatorsCode = generateValidators(entities);
      const loadersCode = generateLoaders(entities);

      setCode({
        types: typesCode,
        validators: validatorsCode,
        loaders: loadersCode,
      });
    }, [entities]);

    const handleCopy = (code: string) => {
      navigator.clipboard.writeText(code);
      toast({ title: "Copied to clipboard" });
    };

    return (
      <div className="h-80 border-t bg-white">
        <Tabs defaultValue="types" className="h-full">
          <div className="flex items-center justify-between px-4 pt-2 border-b">
            <TabsList>
              <TabsTrigger value="types">Types</TabsTrigger>
              <TabsTrigger value="validators">Validators</TabsTrigger>
              <TabsTrigger value="loaders">Loaders</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="types" className="h-[calc(100%-3rem)] m-0">
            <div className="relative h-full">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 z-10"
                onClick={() => handleCopy(code.types)}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Editor
                height="100%"
                defaultLanguage="typescript"
                value={code.types}
                options={{ readOnly: true, minimap: { enabled: false } }}
              />
            </div>
          </TabsContent>

          <TabsContent value="validators" className="h-[calc(100%-3rem)] m-0">
            <div className="relative h-full">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 z-10"
                onClick={() => handleCopy(code.validators)}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Editor
                height="100%"
                defaultLanguage="typescript"
                value={code.validators}
                options={{ readOnly: true, minimap: { enabled: false } }}
              />
            </div>
          </TabsContent>

          <TabsContent value="loaders" className="h-[calc(100%-3rem)] m-0">
            <div className="relative h-full">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 z-10"
                onClick={() => handleCopy(code.loaders)}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Editor
                height="100%"
                defaultLanguage="typescript"
                value={code.loaders}
                options={{ readOnly: true, minimap: { enabled: false } }}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  function generateTypes(entities: any[]): string {
    return entities
      .map((entity) => {
        const fields = entity.fields
          .map(
            (f: any) =>
              `  ${f.name}${f.required ? "" : "?"}: ${mapType(f.type)};`
          )
          .join("\n");
        return `export interface ${entity.name} {\n${fields}\n}`;
      })
      .join("\n\n");
  }

  function mapType(type: string): string {
    switch (type) {
      case "string":
        return "string";
      case "number":
        return "number";
      case "boolean":
        return "boolean";
      case "reference":
        return "string";
      case "array":
        return "string[]";
      default:
        return "unknown";
    }
  }
  ```

---

### 2.4.6 Version Management (Days 9-10)

- [ ] **Create Version Manager** (`components/version-manager.tsx`)
- [ ] **Implement version list**
- [ ] **Add diff viewer**
- [ ] **Add activate/rollback buttons**

---

### 2.4.7 Validation & Error Display (Day 11)

- [ ] **Real-time validation**
- [ ] **Error toast notifications**
- [ ] **Inline validation errors**

---

### 2.4.8 Schema Activation (Days 12-13)

- [ ] **Save & Validate API call**
- [ ] **Activate version API call**
- [ ] **Success/error handling**

---

### 2.4.9 Deploy to Cloudflare Pages (Day 14)

- [ ] **Create Pulumi deployment script**

  ```typescript
  import * as pulumi from "@pulumi/pulumi";
  import * as cloudflare from "@pulumi/cloudflare";

  const project = new cloudflare.PagesProject("customer-admin-ui", {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    name: "customer-admin-ui",
    productionBranch: "main",
    buildConfig: {
      buildCommand: "npm run build",
      destinationDir: "out",
    },
  });

  export const url = project.subdomain;
  ```

- [ ] **Configure build settings**
- [ ] **Deploy to production**

---

## 🎨 UI/UX Details

### Color Scheme

- Primary: Blue (#3B82F6)
- Success: Green (#10B981)
- Warning: Yellow (#F59E0B)
- Error: Red (#EF4444)
- Background: Slate-50 (#F8FAFC)

### Keyboard Shortcuts

- `Cmd+S` / `Ctrl+S`: Save schema
- `Cmd+Z` / `Ctrl+Z`: Undo
- `Cmd+Shift+Z` / `Ctrl+Shift+Z`: Redo
- `Delete`: Delete selected entity
- `Esc`: Deselect entity

---

## 🧪 Testing

- [ ] Unit tests for store actions
- [ ] Component tests with React Testing Library
- [ ] E2E tests with Playwright
- [ ] Visual regression tests

---

## 🎯 Success Criteria

- ✅ Drag-and-drop entity creation working
- ✅ Field configuration working
- ✅ Live TypeScript preview working
- ✅ Schema validation working
- ✅ Version management working
- ✅ Schema activation working
- ✅ Deployed to Cloudflare Pages
- ✅ Time to create entity: <3 minutes

---

## 📚 Related Documents

- [PHASE_2_SCHEMA_INFRASTRUCTURE.md](./PHASE_2_SCHEMA_INFRASTRUCTURE.md) - Parent phase document
- [RELISH_ADMIN_UI.md](./RELISH_ADMIN_UI.md) - Relish operator dashboard

---

**Last Updated:** January 11, 2026  
**Next Review:** Weekly during implementation
