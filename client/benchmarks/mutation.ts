/**
 * Mutation Benchmark (Phase 2C)
 * Measures grant/revoke roundtrip performance including R2 write-through
 */

export interface MutationMetrics {
  grant: {
    mean: number;
    median: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
  };
  revoke: {
    mean: number;
    median: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
  };
}

export class MutationBenchmark {
  private serverUrl: string;
  private orgId: string;

  constructor(serverUrl: string, orgId: string) {
    this.serverUrl = serverUrl;
    this.orgId = orgId;
  }

  /**
   * Measure grant permission roundtrip
   */
  async measureGrant(iterations: number = 20): Promise<number[]> {
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const user = `user_bench_${i}`;
      const resource = `resource_bench_${i}`;
      const permission = "read";

      const start = performance.now();
      try {
        const response = await fetch(
          `${this.serverUrl}/org/${this.orgId}/grant`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user, resource, permission }),
            cache: "no-store",
          }
        );

        if (!response.ok) {
          console.error("Grant failed:", await response.text());
          continue;
        }

        const end = performance.now();
        times.push(end - start);

        // Optional: Log server-side timing
        const result = await response.json();
        if (result.timing) {
          console.log(
            `Grant ${i}: client=${(end - start).toFixed(1)}ms, server=${
              result.timing.totalMs
            }ms (memory=${result.timing.memoryMs}ms, r2=${
              result.timing.r2Ms
            }ms)`
          );
        }
      } catch (error) {
        console.error("Grant measurement failed:", error);
      }
    }

    return times;
  }

  /**
   * Measure revoke permission roundtrip
   */
  async measureRevoke(iterations: number = 20): Promise<number[]> {
    const times: number[] = [];

    // First grant permissions to revoke
    for (let i = 0; i < iterations; i++) {
      const user = `user_revoke_${i}`;
      const resource = `resource_revoke_${i}`;
      const permission = "read";

      await fetch(`${this.serverUrl}/org/${this.orgId}/grant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, resource, permission }),
      });
    }

    // Now measure revoke
    for (let i = 0; i < iterations; i++) {
      const user = `user_revoke_${i}`;
      const resource = `resource_revoke_${i}`;

      const start = performance.now();
      try {
        const response = await fetch(
          `${this.serverUrl}/org/${this.orgId}/revoke`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user, resource }),
            cache: "no-store",
          }
        );

        if (!response.ok) {
          console.error("Revoke failed:", await response.text());
          continue;
        }

        const end = performance.now();
        times.push(end - start);

        // Optional: Log server-side timing
        const result = await response.json();
        if (result.timing) {
          console.log(
            `Revoke ${i}: client=${(end - start).toFixed(1)}ms, server=${
              result.timing.totalMs
            }ms (memory=${result.timing.memoryMs}ms, r2=${
              result.timing.r2Ms
            }ms)`
          );
        }
      } catch (error) {
        console.error("Revoke measurement failed:", error);
      }
    }

    return times;
  }

  /**
   * Run full mutation benchmark suite
   */
  async runFullSuite(): Promise<MutationMetrics> {
    console.log("🔄 Running mutation benchmark suite...");

    const grantTimes = await this.measureGrant(20);
    const revokeTimes = await this.measureRevoke(20);

    return {
      grant: this.calculateStats(grantTimes),
      revoke: this.calculateStats(revokeTimes),
    };
  }

  private calculateStats(times: number[]): {
    mean: number;
    median: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
  } {
    if (times.length === 0) {
      return { mean: 0, median: 0, p95: 0, p99: 0, min: 0, max: 0 };
    }

    const sorted = times.slice().sort((a, b) => a - b);
    const sum = times.reduce((a, b) => a + b, 0);

    return {
      mean: sum / times.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      min: Math.min(...times),
      max: Math.max(...times),
    };
  }
}
