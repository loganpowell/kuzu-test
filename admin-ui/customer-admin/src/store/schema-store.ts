import { create } from 'zustand';

export interface SchemaField {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'reference' | 'array';
  required: boolean;
  unique?: boolean;
  pattern?: string;
  enum?: string[];
  reference?: string; // entity name for reference type
  description?: string;
}

export interface SchemaEntity {
  id: string;
  name: string;
  description?: string;
  fields: SchemaField[];
  position?: { x: number; y: number }; // for canvas positioning
}

export interface SchemaRelationship {
  id: string;
  name: string;
  from: string; // entity name
  to: string; // entity name
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  properties: SchemaField[];
  description?: string;
}

export interface Schema {
  version: number;
  name: string;
  description?: string;
  entities: SchemaEntity[];
  relationships: SchemaRelationship[];
}

interface SchemaStore {
  // State
  schema: Schema;
  selectedEntityId: string | null;
  isModified: boolean;
  validationErrors: string[];

  // Actions - Entities
  addEntity: (name: string) => void;
  updateEntity: (id: string, updates: Partial<SchemaEntity>) => void;
  deleteEntity: (id: string) => void;
  selectEntity: (id: string | null) => void;
  moveEntity: (id: string, position: { x: number; y: number }) => void;

  // Actions - Fields
  addField: (entityId: string, field: Omit<SchemaField, 'id'>) => void;
  updateField: (entityId: string, fieldId: string, updates: Partial<SchemaField>) => void;
  deleteField: (entityId: string, fieldId: string) => void;
  reorderFields: (entityId: string, fieldIds: string[]) => void;

  // Actions - Relationships
  addRelationship: (relationship: Omit<SchemaRelationship, 'id'>) => void;
  updateRelationship: (id: string, updates: Partial<SchemaRelationship>) => void;
  deleteRelationship: (id: string) => void;

  // Actions - Schema
  setSchema: (schema: Schema) => void;
  resetSchema: () => void;
  setValidationErrors: (errors: string[]) => void;
}

const defaultSchema: Schema = {
  version: 1,
  name: 'My Schema',
  description: 'Custom authorization schema',
  entities: [],
  relationships: [],
};

let entityCounter = 1;
let fieldCounter = 1;
let relationshipCounter = 1;

export const useSchemaStore = create<SchemaStore>((set, get) => ({
  schema: defaultSchema,
  selectedEntityId: null,
  isModified: false,
  validationErrors: [],

  // Entity actions
  addEntity: (name: string) => {
    const id = `entity-${entityCounter++}`;
    const newEntity: SchemaEntity = {
      id,
      name,
      fields: [
        {
          id: `field-${fieldCounter++}`,
          name: 'id',
          type: 'string',
          required: true,
          unique: true,
          description: 'Unique identifier',
        },
      ],
      position: { x: 100, y: 100 },
    };

    set((state) => ({
      schema: {
        ...state.schema,
        entities: [...state.schema.entities, newEntity],
      },
      isModified: true,
    }));
  },

  updateEntity: (id: string, updates: Partial<SchemaEntity>) => {
    set((state) => ({
      schema: {
        ...state.schema,
        entities: state.schema.entities.map((entity) =>
          entity.id === id ? { ...entity, ...updates } : entity
        ),
      },
      isModified: true,
    }));
  },

  deleteEntity: (id: string) => {
    set((state) => ({
      schema: {
        ...state.schema,
        entities: state.schema.entities.filter((entity) => entity.id !== id),
        relationships: state.schema.relationships.filter(
          (rel) => rel.from !== id && rel.to !== id
        ),
      },
      selectedEntityId: state.selectedEntityId === id ? null : state.selectedEntityId,
      isModified: true,
    }));
  },

  selectEntity: (id: string | null) => {
    set({ selectedEntityId: id });
  },

  moveEntity: (id: string, position: { x: number; y: number }) => {
    set((state) => ({
      schema: {
        ...state.schema,
        entities: state.schema.entities.map((entity) =>
          entity.id === id ? { ...entity, position } : entity
        ),
      },
      isModified: true,
    }));
  },

  // Field actions
  addField: (entityId: string, field: Omit<SchemaField, 'id'>) => {
    const id = `field-${fieldCounter++}`;
    set((state) => ({
      schema: {
        ...state.schema,
        entities: state.schema.entities.map((entity) =>
          entity.id === entityId
            ? { ...entity, fields: [...entity.fields, { id, ...field }] }
            : entity
        ),
      },
      isModified: true,
    }));
  },

  updateField: (entityId: string, fieldId: string, updates: Partial<SchemaField>) => {
    set((state) => ({
      schema: {
        ...state.schema,
        entities: state.schema.entities.map((entity) =>
          entity.id === entityId
            ? {
                ...entity,
                fields: entity.fields.map((field) =>
                  field.id === fieldId ? { ...field, ...updates } : field
                ),
              }
            : entity
        ),
      },
      isModified: true,
    }));
  },

  deleteField: (entityId: string, fieldId: string) => {
    set((state) => ({
      schema: {
        ...state.schema,
        entities: state.schema.entities.map((entity) =>
          entity.id === entityId
            ? {
                ...entity,
                fields: entity.fields.filter((field) => field.id !== fieldId),
              }
            : entity
        ),
      },
      isModified: true,
    }));
  },

  reorderFields: (entityId: string, fieldIds: string[]) => {
    set((state) => ({
      schema: {
        ...state.schema,
        entities: state.schema.entities.map((entity) => {
          if (entity.id === entityId) {
            const fieldMap = new Map(entity.fields.map((f) => [f.id, f]));
            const reorderedFields = fieldIds
              .map((id) => fieldMap.get(id))
              .filter((f): f is SchemaField => f !== undefined);
            return { ...entity, fields: reorderedFields };
          }
          return entity;
        }),
      },
      isModified: true,
    }));
  },

  // Relationship actions
  addRelationship: (relationship: Omit<SchemaRelationship, 'id'>) => {
    const id = `rel-${relationshipCounter++}`;
    set((state) => ({
      schema: {
        ...state.schema,
        relationships: [...state.schema.relationships, { id, ...relationship }],
      },
      isModified: true,
    }));
  },

  updateRelationship: (id: string, updates: Partial<SchemaRelationship>) => {
    set((state) => ({
      schema: {
        ...state.schema,
        relationships: state.schema.relationships.map((rel) =>
          rel.id === id ? { ...rel, ...updates } : rel
        ),
      },
      isModified: true,
    }));
  },

  deleteRelationship: (id: string) => {
    set((state) => ({
      schema: {
        ...state.schema,
        relationships: state.schema.relationships.filter((rel) => rel.id !== id),
      },
      isModified: true,
    }));
  },

  // Schema actions
  setSchema: (schema: Schema) => {
    set({ schema, isModified: false });
  },

  resetSchema: () => {
    set({ schema: defaultSchema, selectedEntityId: null, isModified: false });
  },

  setValidationErrors: (errors: string[]) => {
    set({ validationErrors: errors });
  },
}));
