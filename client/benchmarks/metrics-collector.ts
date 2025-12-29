/**
 * Performance metrics collector using browser Performance API
 */

export interface TimingResult {
  mean: number;
  median: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  stdDev: number;
}

export class MetricsCollector {
  private measurements: Map<string, number[]> = new Map();

  /**
   * Mark the start of a performance measurement
   */
  mark(name: string): void {
    performance.mark(`${name}-start`);
  }

  /**
   * Mark the end of a performance measurement and record the duration
   */
  measure(name: string): number {
    const startMark = `${name}-start`;
    const endMark = `${name}-end`;

    performance.mark(endMark);

    try {
      const measure = performance.measure(name, startMark, endMark);
      const duration = measure.duration;

      // Store the measurement
      if (!this.measurements.has(name)) {
        this.measurements.set(name, []);
      }
      this.measurements.get(name)!.push(duration);

      // Cleanup marks
      performance.clearMarks(startMark);
      performance.clearMarks(endMark);
      performance.clearMeasures(name);

      return duration;
    } catch (error) {
      console.error(`Failed to measure ${name}:`, error);
      return 0;
    }
  }

  /**
   * Time an async function and record the duration
   */
  async time<T>(
    name: string,
    fn: () => Promise<T>
  ): Promise<{ result: T; duration: number }> {
    this.mark(name);
    const result = await fn();
    const duration = this.measure(name);
    return { result, duration };
  }

  /**
   * Time a sync function and record the duration
   */
  timeSync<T>(name: string, fn: () => T): { result: T; duration: number } {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;

    if (!this.measurements.has(name)) {
      this.measurements.set(name, []);
    }
    this.measurements.get(name)!.push(duration);

    return { result, duration };
  }

  /**
   * Get statistics for a named measurement
   */
  getStats(name: string): TimingResult | null {
    const timings = this.measurements.get(name);
    if (!timings || timings.length === 0) {
      return null;
    }

    return this.calculateStats(timings);
  }

  /**
   * Calculate statistics from an array of timings
   */
  calculateStats(timings: number[]): TimingResult {
    const sorted = [...timings].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / sorted.length;

    // Calculate standard deviation
    const squaredDiffs = sorted.map((x) => Math.pow(x - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / sorted.length;
    const stdDev = Math.sqrt(variance);

    return {
      mean,
      median: this.percentile(sorted, 50),
      p95: this.percentile(sorted, 95),
      p99: this.percentile(sorted, 99),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      stdDev,
    };
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sorted: number[], p: number): number {
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (lower === upper) {
      return sorted[lower];
    }

    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  /**
   * Get all measurements
   */
  getAllMeasurements(): Map<string, number[]> {
    return new Map(this.measurements);
  }

  /**
   * Clear all measurements
   */
  clear(): void {
    this.measurements.clear();
    performance.clearMarks();
    performance.clearMeasures();
  }

  /**
   * Get memory usage (Chrome only)
   */
  getMemoryUsage(): {
    heapUsed: number;
    heapTotal: number;
    heapLimit: number;
  } | null {
    // @ts-ignore - Chrome specific API
    if (performance.memory) {
      // @ts-ignore
      const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } =
        performance.memory;
      return {
        heapUsed: usedJSHeapSize,
        heapTotal: totalJSHeapSize,
        heapLimit: jsHeapSizeLimit,
      };
    }
    return null;
  }

  /**
   * Get connection info
   */
  getConnectionInfo(): {
    effectiveType: string;
    downlink: number;
    rtt: number;
  } | null {
    // @ts-ignore - NetworkInformation API
    const connection =
      navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection;
    if (connection) {
      return {
        effectiveType: connection.effectiveType || "unknown",
        downlink: connection.downlink || 0,
        rtt: connection.rtt || 0,
      };
    }
    return null;
  }
}
