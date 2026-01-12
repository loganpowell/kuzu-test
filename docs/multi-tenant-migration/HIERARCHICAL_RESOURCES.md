# Hierarchical Resources & Permission Inheritance

**Question:** Does the system support hierarchical resource relationships where permissions propagate down the hierarchy?

**Short Answer:** ✅ **Partially supported** - Foundation exists but requires additional implementation

---

## Current Support (Phase 1/2)

### ✅ What We Have

**1. Self-Referential Relationships**

Our schema system **already supports** entities that reference themselves:

```typescript
// Group can inherit from another Group
{
  name: "inherits_from",
  from: "Group",
  to: "Group",
  properties: [],
  createRelTableSQL: "CREATE REL TABLE inherits_from(FROM Group TO Group)"
}
```

This means you can model:

- **Group hierarchies:** `engineering` → `backend-team` → `junior-devs`
- **Resource hierarchies:** `folder1` → `folder2` → `file.txt`
- **Path hierarchies:** `/api` → `/api/users` → `/api/users/:id`

**2. Edge Chain Validation**

The system validates **multi-hop permission paths**:

```typescript
// validateChain() in GraphStateCSV.ts
User → member_of → Group → inherits_from → ParentGroup → has_permission → Resource
```

The chain validator ensures:

- ✅ Each edge connects properly (target of edge N = source of edge N+1)
- ✅ No revoked edges in the chain
- ✅ Chain starts at user, ends at resource

**3. Dynamic Schema Support**

Organizations can define **custom hierarchical entities**:

```yaml
# Example: File system hierarchy
entities:
  - name: Folder
    fields:
      - name: id
        type: STRING
      - name: path
        type: STRING

relationships:
  - name: contains
    from: Folder
    to: Folder # Folder can contain other folders
  - name: contains
    from: Folder
    to: File # Folder can contain files
```

### ❌ What We're Missing

**1. Automatic Transitive Permission Resolution**

The client SDK currently requires **explicit edge chains**:

```typescript
// Current (manual):
await client.validateEdgeProof({
  userId: "user:alice",
  resourceId: "Resource:/docs/secret.txt",
  edgeIds: [
    "user:alice:member_of:group:engineers",
    "group:engineers:inherits_from:group:admins",
    "group:admins:has_permission:Resource:/docs",
  ],
});
```

What we want (automatic):

```typescript
// Desired (automatic):
await client.checkPermission({
  userId: "user:alice",
  resourceId: "Resource:/docs/secret.txt",
  permission: "read",
});
// Should automatically find the path:
//   alice → engineers → admins → /docs → /docs/secret.txt
```

**2. Wildcard/Pattern-Based Permissions**

We don't yet support:

- `Resource:/api/*` grants access to all child paths
- `Resource:/docs/**` grants recursive access to all descendants
- `Resource:*.txt` grants access to all text files

**3. Permission Inheritance Algorithm**

No automatic traversal for:

- "If parent folder is readable, child files are readable"
- "If group has admin on `/api`, they have admin on `/api/users`"
- "If resource is in hierarchy, check parent permissions"

---

## Implementation Roadmap

### Phase 2.5: Permission Inheritance (Estimated: 2-3 weeks)

**Task 1: Add Hierarchical Metadata to Schema** (Week 1)

Extend schema definitions to declare hierarchy semantics:

```typescript
interface EntityDefinition {
  name: string;
  fields: FieldDefinition[];
  createTableSQL: string;
  // NEW: Hierarchy configuration
  hierarchyConfig?: {
    parentField: string; // "parent_id" or "path"
    pathSeparator?: string; // "/" for paths, null for ID-based
    inheritPermissions: boolean; // Auto-inherit from parent?
  };
}
```

Example schema:

```typescript
{
  name: "Folder",
  fields: [
    { name: "id", type: "STRING", primaryKey: true },
    { name: "parent_id", type: "REFERENCE", references: "Folder" },
    { name: "path", type: "STRING" }
  ],
  hierarchyConfig: {
    parentField: "parent_id",
    inheritPermissions: true
  }
}
```

**Task 2: Implement Path Resolution Algorithm** (Week 1-2)

Add to `GraphStateCSV`:

```typescript
/**
 * Find all possible permission paths from user to resource
 * Includes:
 * - Direct paths (user → resource)
 * - Group inheritance paths (user → group → parent_group → resource)
 * - Resource hierarchy paths (user → parent_resource → child_resource)
 */
async findPermissionPaths(
  userId: string,
  resourceId: string,
  permission: string
): Promise<string[][]> {
  const paths: string[][] = [];

  // 1. Direct permissions (existing)
  const directEdges = this.state.edges.get(`${userId}:has_permission:${resourceId}`);
  if (directEdges) paths.push([directEdges.id]);

  // 2. Group membership paths (existing)
  const groupPaths = await this.findGroupPaths(userId, resourceId);
  paths.push(...groupPaths);

  // 3. NEW: Resource hierarchy traversal
  const hierarchyPaths = await this.findHierarchyPaths(userId, resourceId);
  paths.push(...hierarchyPaths);

  return paths;
}

/**
 * NEW: Find permission paths through resource hierarchy
 * Example: permission on /api grants access to /api/users
 */
private async findHierarchyPaths(
  userId: string,
  resourceId: string
): Promise<string[][]> {
  const paths: string[][] = [];
  const resourceSchema = this.getEntitySchema("Resource");

  if (!resourceSchema?.hierarchyConfig?.inheritPermissions) {
    return paths; // Hierarchy not enabled for this entity
  }

  // Parse resource path (e.g., "Resource:/api/users/123")
  const resourcePath = this.extractPath(resourceId);
  const pathSegments = resourcePath.split('/').filter(s => s);

  // Check permissions on each ancestor path
  // /api/users/123 → check /api/users → check /api → check /
  for (let i = pathSegments.length - 1; i >= 0; i--) {
    const ancestorPath = '/' + pathSegments.slice(0, i).join('/');
    const ancestorResource = `Resource:${ancestorPath}`;

    // Check if user has permission on ancestor
    const ancestorEdgeId = `${userId}:has_permission:${ancestorResource}`;
    const ancestorEdge = this.state.edges.get(ancestorEdgeId);

    if (ancestorEdge) {
      // Found permission on ancestor - build path
      const hierarchyEdgeId = `${ancestorResource}:contains:${resourceId}`;
      paths.push([ancestorEdgeId, hierarchyEdgeId]);
    }

    // Also check group permissions on ancestor
    const groupPaths = await this.findGroupPathsToResource(userId, ancestorResource);
    for (const groupPath of groupPaths) {
      const hierarchyEdgeId = `${ancestorResource}:contains:${resourceId}`;
      paths.push([...groupPath, hierarchyEdgeId]);
    }
  }

  return paths;
}
```

**Task 3: Add Wildcard Support** (Week 2)

```typescript
/**
 * Check if a permission pattern matches a resource path
 * Supports:
 * - /api/* - matches immediate children
 * - /api/** - matches all descendants
 * - *.txt - matches all .txt files
 */
private matchesPattern(pattern: string, resourcePath: string): boolean {
  if (pattern.endsWith('/**')) {
    // Recursive match
    const prefix = pattern.slice(0, -3);
    return resourcePath.startsWith(prefix);
  } else if (pattern.endsWith('/*')) {
    // Immediate children only
    const prefix = pattern.slice(0, -2);
    const remainder = resourcePath.slice(prefix.length + 1);
    return resourcePath.startsWith(prefix) && !remainder.includes('/');
  } else if (pattern.includes('*')) {
    // Simple wildcard (e.g., *.txt)
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(resourcePath);
  } else {
    // Exact match
    return pattern === resourcePath;
  }
}
```

**Task 4: Update Client SDK** (Week 2-3)

Add high-level API:

```typescript
// New method in client SDK
async checkPermission(params: {
  userId: string;
  resourceId: string;
  permission: string;
  includeHierarchy?: boolean; // Default: true
}): Promise<{
  granted: boolean;
  path?: string[];  // The permission chain that granted access
  source?: 'direct' | 'group' | 'hierarchy' | 'wildcard';
}> {
  // Find all possible paths (includes hierarchy)
  const paths = await this.findPermissionPaths(
    params.userId,
    params.resourceId,
    params.permission
  );

  if (paths.length === 0) {
    return { granted: false };
  }

  // Return first valid path
  const path = paths[0];
  const source = this.classifyPath(path);

  return {
    granted: true,
    path,
    source
  };
}
```

---

## Use Cases Supported After Implementation

### 1. File System Hierarchy

```typescript
// Schema
{
  entities: [
    {
      name: "Folder",
      hierarchyConfig: {
        parentField: "parent_id",
        inheritPermissions: true
      }
    },
    { name: "File" }
  ],
  relationships: [
    { name: "contains", from: "Folder", to: "Folder" },
    { name: "contains", from: "Folder", to: "File" }
  ]
}

// Usage
await client.checkPermission({
  userId: "user:alice",
  resourceId: "File:/docs/2025/report.pdf",
  permission: "read"
});
// Auto-checks: /docs/2025/report.pdf → /docs/2025 → /docs → /
```

### 2. API Path Hierarchy

```typescript
// Grant permission with wildcard
await client.grantPermission({
  userId: "user:alice",
  resourceId: "Resource:/api/**", // All API endpoints
  permission: "admin",
});

// Later, check specific endpoint
await client.checkPermission({
  userId: "user:alice",
  resourceId: "Resource:/api/users/123",
  permission: "read",
});
// Returns: granted=true, source='wildcard'
```

### 3. Nested Groups

```typescript
// Already works! (inherits_from relationship)
// junior-dev → backend-team → engineering → company-wide
await client.grantPermission({
  groupId: "group:company-wide",
  resourceId: "Resource:/handbook",
  permission: "read",
});

// Any member of nested groups gets access
await client.checkPermission({
  userId: "user:alice", // member of junior-dev
  resourceId: "Resource:/handbook",
  permission: "read",
});
// Returns: granted=true, source='group'
```

### 4. Multi-Level Inheritance

```typescript
// Complex hierarchy: folders + groups + wildcards
Alice → JuniorDevs → BackendTeam → Engineering
Engineering → has_permission → /projects/**
/projects/backend/api → contains → /projects/backend/api/users.ts

// Check permission
await client.checkPermission({
  userId: "user:alice",
  resourceId: "File:/projects/backend/api/users.ts",
  permission: "read"
});

// Permission path found:
// alice → JuniorDevs → BackendTeam → Engineering
// → /projects/** (wildcard)
// → /projects/backend/api (hierarchy)
// → /projects/backend/api/users.ts
```

---

## Performance Considerations

### Current (No Hierarchy)

- **Validation:** O(n) where n = edge chain length (typically 3-5)
- **Storage:** O(e) where e = number of explicit edges

### With Hierarchy (Proposed)

- **Validation:** O(n × d × g) where:
  - n = edge chain length (3-5)
  - d = hierarchy depth (typically 3-7 for file systems)
  - g = group membership count (typically 2-10)
- **Storage:** Same O(e), but fewer explicit edges needed (inheritance reduces storage)

**Optimization Strategies:**

1. **Path Caching** - Cache permission resolution for hot paths
2. **Depth Limits** - Limit hierarchy traversal to 10 levels max
3. **Index Optimization** - Use relationship indexes for O(1) parent lookups
4. **Early Exit** - Stop on first valid path found
5. **Lazy Loading** - Only traverse hierarchy if direct check fails

---

## Migration Path

### Step 1: Add hierarchy support to schema (non-breaking)

### Step 2: Implement path resolution algorithm

### Step 3: Add opt-in client SDK methods (preserves existing API)

### Step 4: Document best practices (when to use hierarchy vs explicit)

### Step 5: Add admin UI for visualizing permission paths

---

## Decision Required

**Should we implement hierarchical permissions in Phase 2 or defer to Phase 3?**

**✅ Arguments for Phase 2:**

- Foundation already exists (inherits_from, dynamic schemas)
- Unblocks important use cases (file systems, API paths)
- Makes system more competitive vs Oso, Warrant, etc.

**❌ Arguments for Phase 3:**

- Adds complexity to hot path (permission checks)
- Requires careful testing for security edge cases
- Can be added non-breaking later

**Recommendation:**

- Implement **basic hierarchy traversal** in Phase 2 (no wildcards)
- Add **wildcard support** in Phase 3
- Keep **explicit edge chains** as primary API (performance + clarity)
- Make **hierarchy checks opt-in** via `includeHierarchy: true` flag

---

**Last Updated:** January 12, 2026  
**Status:** Proposal for Phase 2.5 (2-3 week effort)  
**Complexity:** Medium (builds on existing edge chain system)
