/**
 * Test real authorization scenarios with the full graph data
 */

import * as fs from "fs";
import * as path from "path";

interface GraphData {
  users: any[];
  groups: any[];
  resources: any[];
  memberOf: any[];
  inheritsFrom: any[];
  userPermissions: any[];
  groupPermissions: any[];
}

interface Permission {
  can_create: boolean;
  can_read: boolean;
  can_update: boolean;
  can_delete: boolean;
  granted_at: string;
  granted_by: string;
}

// Load data
const dataDir = path.join(__dirname, "../data/json");
const data: GraphData = {
  users: JSON.parse(fs.readFileSync(path.join(dataDir, "users.json"), "utf-8")),
  groups: JSON.parse(
    fs.readFileSync(path.join(dataDir, "groups.json"), "utf-8")
  ),
  resources: JSON.parse(
    fs.readFileSync(path.join(dataDir, "resources.json"), "utf-8")
  ),
  memberOf: JSON.parse(
    fs.readFileSync(path.join(dataDir, "member_of.json"), "utf-8")
  ),
  inheritsFrom: JSON.parse(
    fs.readFileSync(path.join(dataDir, "inherits_from.json"), "utf-8")
  ),
  userPermissions: JSON.parse(
    fs.readFileSync(path.join(dataDir, "user_permissions.json"), "utf-8")
  ),
  groupPermissions: JSON.parse(
    fs.readFileSync(path.join(dataDir, "group_permissions.json"), "utf-8")
  ),
};

console.log("📊 Graph Data Loaded:");
console.log(`  Users: ${data.users.length}`);
console.log(`  Groups: ${data.groups.length}`);
console.log(`  Resources: ${data.resources.length}`);
console.log(`  Member Of: ${data.memberOf.length}`);
console.log(`  Inherits From: ${data.inheritsFrom.length}`);
console.log(`  User Permissions: ${data.userPermissions.length}`);
console.log(`  Group Permissions: ${data.groupPermissions.length}`);
console.log();

// Build indexes
const memberOfIndex = new Map<string, Set<string>>();
const inheritsFromIndex = new Map<string, string>();
const userPermIndex = new Map<string, Map<string, Permission>>();
const groupPermIndex = new Map<string, Map<string, Permission>>();

for (const rel of data.memberOf) {
  if (!memberOfIndex.has(rel.from)) {
    memberOfIndex.set(rel.from, new Set());
  }
  memberOfIndex.get(rel.from)!.add(rel.to);
}

for (const rel of data.inheritsFrom) {
  inheritsFromIndex.set(rel.from, rel.to);
}

for (const perm of data.userPermissions) {
  if (!userPermIndex.has(perm.from)) {
    userPermIndex.set(perm.from, new Map());
  }
  userPermIndex.get(perm.from)!.set(perm.to, {
    can_create: perm.can_create,
    can_read: perm.can_read,
    can_update: perm.can_update,
    can_delete: perm.can_delete,
    granted_at: perm.granted_at,
    granted_by: perm.granted_by,
  });
}

for (const perm of data.groupPermissions) {
  if (!groupPermIndex.has(perm.from)) {
    groupPermIndex.set(perm.from, new Map());
  }
  groupPermIndex.get(perm.from)!.set(perm.to, {
    can_create: perm.can_create,
    can_read: perm.can_read,
    can_update: perm.can_update,
    can_delete: perm.can_delete,
    granted_at: perm.granted_at,
    granted_by: perm.granted_by,
  });
}

// Permission check function
function checkPermission(
  userId: string,
  resource: string,
  action: "create" | "read" | "update" | "delete"
): boolean {
  const permKey = `can_${action}` as keyof Permission;

  // 1. Check direct user permission
  const userPerms = userPermIndex.get(userId)?.get(resource);
  if (userPerms && userPerms[permKey]) {
    return true;
  }

  // 2. Check group permissions (including inherited)
  const userGroups = memberOfIndex.get(userId);
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
    const parentGroup = inheritsFromIndex.get(groupId);
    if (parentGroup) {
      queue.push(parentGroup);
    }
  }

  // Check permissions for all groups
  for (const groupId of allGroups) {
    const groupPerms = groupPermIndex.get(groupId)?.get(resource);
    if (groupPerms && groupPerms[permKey]) {
      return true;
    }
  }

  return false;
}

console.log("🧪 Test Cases:\n");

// Test 1: Direct user permission
const testUser1 = data.userPermissions[0];
const hasDirectPerm = checkPermission(testUser1.from, testUser1.to, "read");
console.log(`✓ Test 1: Direct user permission`);
console.log(
  `  User ${testUser1.from} can read ${testUser1.to}: ${hasDirectPerm}`
);
console.log(`  Expected: ${testUser1.can_read}, Got: ${hasDirectPerm}`);
console.log(
  `  ${hasDirectPerm === testUser1.can_read ? "✅ PASS" : "❌ FAIL"}\n`
);

// Test 2: Group permission
const testMembership = data.memberOf.find((m) => {
  const groups = memberOfIndex.get(m.from);
  if (!groups) return false;
  for (const groupId of groups) {
    const perms = groupPermIndex.get(groupId);
    if (perms && perms.size > 0) return true;
  }
  return false;
});

if (testMembership) {
  const userGroups = memberOfIndex.get(testMembership.from)!;
  let foundResource: string | null = null;
  let foundAction: "create" | "read" | "update" | "delete" | null = null;

  for (const groupId of userGroups) {
    const perms = groupPermIndex.get(groupId);
    if (perms) {
      for (const [resource, perm] of perms) {
        if (perm.can_read) {
          foundResource = resource;
          foundAction = "read";
          break;
        }
      }
      if (foundResource) break;
    }
  }

  if (foundResource && foundAction) {
    const hasGroupPerm = checkPermission(
      testMembership.from,
      foundResource,
      foundAction
    );
    console.log(`✓ Test 2: Group permission`);
    console.log(
      `  User ${testMembership.from} can ${foundAction} ${foundResource} via group: ${hasGroupPerm}`
    );
    console.log(`  ${hasGroupPerm ? "✅ PASS" : "❌ FAIL"}\n`);
  }
}

// Test 3: Inherited group permission
const inheritedGroup = data.inheritsFrom[0];
const childGroups = memberOfIndex.get(inheritedGroup.from);
const parentPerms = groupPermIndex.get(inheritedGroup.to);

if (childGroups && parentPerms && parentPerms.size > 0) {
  // Find a user in the child group
  let testUser: string | null = null;
  for (const [userId, groups] of memberOfIndex) {
    if (groups.has(inheritedGroup.from)) {
      testUser = userId;
      break;
    }
  }

  if (testUser) {
    const [resource, perm] = Array.from(parentPerms)[0];
    const action = perm.can_read
      ? "read"
      : perm.can_create
      ? "create"
      : perm.can_update
      ? "update"
      : "delete";
    const hasInheritedPerm = checkPermission(testUser, resource, action as any);

    console.log(`✓ Test 3: Inherited group permission`);
    console.log(`  User ${testUser} in group ${inheritedGroup.from}`);
    console.log(
      `  Group ${inheritedGroup.from} inherits from ${inheritedGroup.to}`
    );
    console.log(
      `  Can ${action} ${resource} via inherited group: ${hasInheritedPerm}`
    );
    console.log(`  ${hasInheritedPerm ? "✅ PASS" : "❌ FAIL"}\n`);
  }
}

// Test 4: Permission denied (no permission)
const randomUser = data.users[Math.floor(Math.random() * data.users.length)].id;
const randomResource =
  data.resources[Math.floor(Math.random() * data.resources.length)].id;
const hasNoPerm = checkPermission(randomUser, randomResource, "delete");
console.log(`✓ Test 4: Permission denied`);
console.log(`  User ${randomUser} can delete ${randomResource}: ${hasNoPerm}`);
console.log(`  (Random check - likely denied)\n`);

// Performance test
console.log("⚡ Performance Test:\n");
const perfTestUser = data.users[100].id;
const perfTestResource = data.resources[10].id;

const iterations = 10000;
const start = Date.now();
for (let i = 0; i < iterations; i++) {
  checkPermission(perfTestUser, perfTestResource, "read");
}
const duration = Date.now() - start;
const opsPerSec = Math.round((iterations / duration) * 1000);

console.log(`  Checked ${iterations} permissions in ${duration}ms`);
console.log(`  Throughput: ${opsPerSec.toLocaleString()} ops/sec\n`);

// Stats
const usersWithPerms = new Set(data.userPermissions.map((p) => p.from));
const usersInGroups = new Set(data.memberOf.map((m) => m.from));
const usersWithAnyAccess = new Set([...usersWithPerms, ...usersInGroups]);

console.log("📈 Statistics:\n");
console.log(`  Users with direct permissions: ${usersWithPerms.size}`);
console.log(`  Users in groups: ${usersInGroups.size}`);
console.log(
  `  Users with any access: ${usersWithAnyAccess.size} / ${
    data.users.length
  } (${Math.round((usersWithAnyAccess.size / data.users.length) * 100)}%)`
);
console.log(
  `  Average groups per user: ${(
    data.memberOf.length / usersInGroups.size
  ).toFixed(2)}`
);
console.log(`  Groups with inheritance: ${data.inheritsFrom.length}`);
