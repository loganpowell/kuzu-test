/**
 * Benchmark test scenarios matching server-side tests
 */

export interface TestScenario {
  name: string;
  description: string;
  iterations: number;
  setup?: () => Promise<void>;
  run: () => Promise<boolean>;
  teardown?: () => Promise<void>;
}

/**
 * Test data utilities
 */
export class TestData {
  users: string[] = [];
  groups: string[] = [];
  resources: string[] = [];
  userPermissions: Map<string, Set<string>> = new Map();
  groupPermissions: Map<string, Set<string>> = new Map();
  memberOf: Map<string, Set<string>> = new Map();
  inheritsFrom: Map<string, string> = new Map();

  /**
   * Load test data from the server
   */
  async loadFromServer(serverUrl: string, orgId: string): Promise<void> {
    const response = await fetch(`${serverUrl}/org/${orgId}/data`);
    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.statusText}`);
    }

    const data = await response.json();

    // Parse users
    this.users = data.users.map((u: any) => u.id);

    // Parse groups
    this.groups = data.groups.map((g: any) => g.id);

    // Parse resources
    this.resources = data.resources.map((r: any) => r.id);

    // Parse member_of relationships
    for (const rel of data.member_of) {
      if (!this.memberOf.has(rel.user_id)) {
        this.memberOf.set(rel.user_id, new Set());
      }
      this.memberOf.get(rel.user_id)!.add(rel.group_id);
    }

    // Parse inherits_from relationships
    for (const rel of data.inherits_from) {
      this.inheritsFrom.set(rel.group_id, rel.parent_group_id);
    }

    // Parse user permissions
    for (const perm of data.user_permissions) {
      const key = `${perm.user_id}:${perm.resource_id}`;
      if (!this.userPermissions.has(key)) {
        this.userPermissions.set(key, new Set());
      }
      this.userPermissions.get(key)!.add(perm.capability);
    }

    // Parse group permissions
    for (const perm of data.group_permissions) {
      const key = `${perm.group_id}:${perm.resource_id}`;
      if (!this.groupPermissions.has(key)) {
        this.groupPermissions.set(key, new Set());
      }
      this.groupPermissions.get(key)!.add(perm.capability);
    }
  }

  /**
   * Get random user
   */
  randomUser(): string {
    return this.users[Math.floor(Math.random() * this.users.length)];
  }

  /**
   * Get random group
   */
  randomGroup(): string {
    return this.groups[Math.floor(Math.random() * this.groups.length)];
  }

  /**
   * Get random resource
   */
  randomResource(): string {
    return this.resources[Math.floor(Math.random() * this.resources.length)];
  }

  /**
   * Get a resource that a user has direct permission to
   */
  getUserResource(userId: string): string | null {
    for (const [key, _] of this.userPermissions) {
      const [uid, resourceId] = key.split(":");
      if (uid === userId) {
        return resourceId;
      }
    }
    return null;
  }

  /**
   * Get a resource that a user's group has permission to
   */
  getGroupResource(userId: string): string | null {
    const groups = this.memberOf.get(userId);
    if (!groups) return null;

    for (const groupId of groups) {
      for (const [key, _] of this.groupPermissions) {
        const [gid, resourceId] = key.split(":");
        if (gid === groupId) {
          return resourceId;
        }
      }
    }
    return null;
  }

  /**
   * Get a resource requiring multi-hop traversal
   */
  getDeepResource(userId: string, minHops: number = 2): string | null {
    const groups = this.memberOf.get(userId);
    if (!groups) return null;

    // Find a group with parent chain
    for (const groupId of groups) {
      let currentGroup = groupId;
      let hops = 0;

      // Traverse up the group hierarchy
      while (this.inheritsFrom.has(currentGroup) && hops < minHops) {
        currentGroup = this.inheritsFrom.get(currentGroup)!;
        hops++;
      }

      // If we found a long enough chain, find a resource for this group
      if (hops >= minHops) {
        for (const [key, _] of this.groupPermissions) {
          const [gid, resourceId] = key.split(":");
          if (gid === currentGroup) {
            return resourceId;
          }
        }
      }
    }

    return null;
  }
}

/**
 * Create test scenarios
 */
export function createScenarios(
  client: any,
  testData: TestData
): TestScenario[] {
  return [
    {
      name: "Direct User Permissions",
      description: "Check permissions that are directly assigned to users",
      iterations: 1000,
      run: async () => {
        const user = testData.randomUser();
        const resource = testData.getUserResource(user);
        if (!resource) return false;

        return await client.can(user, "read", resource);
      },
    },

    {
      name: "Group Permissions",
      description: "Check permissions inherited through group membership",
      iterations: 1000,
      run: async () => {
        const user = testData.randomUser();
        const resource = testData.getGroupResource(user);
        if (!resource) return false;

        return await client.can(user, "read", resource);
      },
    },

    {
      name: "Multi-Hop Chains",
      description: "Check permissions requiring 3+ hop traversal",
      iterations: 500,
      run: async () => {
        const user = testData.randomUser();
        const resource = testData.getDeepResource(user, 3);
        if (!resource) return false;

        return await client.can(user, "read", resource);
      },
    },

    {
      name: "Mixed Workload",
      description: "Mix of direct, group, and multi-hop checks",
      iterations: 1000,
      run: async () => {
        const rand = Math.random();
        const user = testData.randomUser();

        let resource: string | null;
        if (rand < 0.5) {
          resource = testData.getUserResource(user);
        } else if (rand < 0.8) {
          resource = testData.getGroupResource(user);
        } else {
          resource = testData.getDeepResource(user, 2);
        }

        if (!resource) {
          resource = testData.randomResource();
        }

        return await client.can(user, "read", resource);
      },
    },

    {
      name: "High Concurrency",
      description: "100 simultaneous permission checks",
      iterations: 100,
      run: async () => {
        const checks = Array.from({ length: 100 }, () => {
          const user = testData.randomUser();
          const resource = testData.randomResource();
          return client.can(user, "read", resource);
        });

        const results = await Promise.all(checks);
        return results.every((r) => typeof r === "boolean");
      },
    },

    {
      name: "Batch Queries",
      description: "10 users × 10 resources = 100 checks",
      iterations: 10,
      run: async () => {
        const users = Array.from({ length: 10 }, () => testData.randomUser());
        const resources = Array.from({ length: 10 }, () =>
          testData.randomResource()
        );

        const checks = users.flatMap((user) =>
          resources.map((resource) => client.can(user, "read", resource))
        );

        const results = await Promise.all(checks);
        return results.every((r) => typeof r === "boolean");
      },
    },
  ];
}
