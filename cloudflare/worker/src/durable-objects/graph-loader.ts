/**
 * Load authorization graph data from JSON files
 */

export interface GraphData {
  users: Map<string, any>;
  groups: Map<string, any>;
  resources: Map<string, any>;
  memberOf: Map<string, Set<string>>; // user -> groups
  inheritsFrom: Map<string, string>; // group -> parent group
  userPermissions: Map<string, Map<string, Permission>>; // user -> resource -> permissions
  groupPermissions: Map<string, Map<string, Permission>>; // group -> resource -> permissions
}

export interface Permission {
  can_create: boolean;
  can_read: boolean;
  can_update: boolean;
  can_delete: boolean;
  granted_at: string;
  granted_by: string;
}

/**
 * Load graph data from JSON format
 */
export async function loadGraphData(baseUrl: string): Promise<GraphData> {
  const [
    users,
    groups,
    resources,
    memberOf,
    inheritsFrom,
    userPerms,
    groupPerms,
  ] = await Promise.all([
    fetch(`${baseUrl}/users.json`).then((r) => r.json()),
    fetch(`${baseUrl}/groups.json`).then((r) => r.json()),
    fetch(`${baseUrl}/resources.json`).then((r) => r.json()),
    fetch(`${baseUrl}/member_of.json`).then((r) => r.json()),
    fetch(`${baseUrl}/inherits_from.json`).then((r) => r.json()),
    fetch(`${baseUrl}/user_permissions.json`).then((r) => r.json()),
    fetch(`${baseUrl}/group_permissions.json`).then((r) => r.json()),
  ]);

  const data: GraphData = {
    users: new Map(),
    groups: new Map(),
    resources: new Map(),
    memberOf: new Map(),
    inheritsFrom: new Map(),
    userPermissions: new Map(),
    groupPermissions: new Map(),
  };

  // Load users
  for (const user of users) {
    data.users.set(user.id, user);
  }

  // Load groups
  for (const group of groups) {
    data.groups.set(group.id, group);
  }

  // Load resources
  for (const resource of resources) {
    data.resources.set(resource.id, resource);
  }

  // Load member_of relationships
  for (const rel of memberOf) {
    if (!data.memberOf.has(rel.from)) {
      data.memberOf.set(rel.from, new Set());
    }
    data.memberOf.get(rel.from)!.add(rel.to);
  }

  // Load inherits_from relationships
  for (const rel of inheritsFrom) {
    data.inheritsFrom.set(rel.from, rel.to);
  }

  // Load user permissions
  for (const perm of userPerms) {
    if (!data.userPermissions.has(perm.from)) {
      data.userPermissions.set(perm.from, new Map());
    }
    data.userPermissions.get(perm.from)!.set(perm.to, {
      can_create: perm.can_create,
      can_read: perm.can_read,
      can_update: perm.can_update,
      can_delete: perm.can_delete,
      granted_at: perm.granted_at,
      granted_by: perm.granted_by,
    });
  }

  // Load group permissions
  for (const perm of groupPerms) {
    if (!data.groupPermissions.has(perm.from)) {
      data.groupPermissions.set(perm.from, new Map());
    }
    data.groupPermissions.get(perm.from)!.set(perm.to, {
      can_create: perm.can_create,
      can_read: perm.can_read,
      can_update: perm.can_update,
      can_delete: perm.can_delete,
      granted_at: perm.granted_at,
      granted_by: perm.granted_by,
    });
  }

  return data;
}

/**
 * Check if user has permission on resource
 * Handles:
 * 1. Direct user permissions
 * 2. Group membership permissions
 * 3. Inherited group permissions (transitive)
 */
export function checkPermission(
  data: GraphData,
  userId: string,
  resource: string,
  action: "create" | "read" | "update" | "delete"
): boolean {
  const permKey = `can_${action}` as keyof Permission;

  // 1. Check direct user permission
  const userPerms = data.userPermissions.get(userId)?.get(resource);
  if (userPerms && userPerms[permKey]) {
    return true;
  }

  // 2. Check group permissions (including inherited)
  const userGroups = data.memberOf.get(userId);
  if (!userGroups) {
    return false;
  }

  // Get all groups including inherited ones
  const allGroups = new Set<string>();
  const queue = Array.from(userGroups);

  while (queue.length > 0) {
    const groupId = queue.shift()!;
    if (allGroups.has(groupId)) continue;

    allGroups.add(groupId);

    // Check if this group inherits from another
    const parentGroup = data.inheritsFrom.get(groupId);
    if (parentGroup) {
      queue.push(parentGroup);
    }
  }

  // Check permissions for all groups
  for (const groupId of allGroups) {
    const groupPerms = data.groupPermissions.get(groupId)?.get(resource);
    if (groupPerms && groupPerms[permKey]) {
      return true;
    }
  }

  return false;
}
