"""
Benchmark authorization query performance in KuzuDB.

Tests common Zanzibar-style authorization patterns:
- Direct permission checks
- Group-based permissions
- Transitive group membership
- Resource access lists
- Reverse lookups (who has access)
"""

import time
import random
import json
import statistics
from pathlib import Path
from typing import Dict, List, Tuple
from dataclasses import dataclass, asdict

import kuzu


@dataclass
class QueryResult:
    """Store query benchmark results."""

    query_name: str
    query: str
    iterations: int
    total_time_sec: float
    avg_time_ms: float
    min_time_ms: float
    max_time_ms: float
    p50_time_ms: float
    p95_time_ms: float
    p99_time_ms: float
    results_count: int

    def to_dict(self):
        return asdict(self)


class AuthorizationBenchmark:
    """Benchmark authorization query patterns."""

    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.db = kuzu.Database(str(db_path))
        self.conn = kuzu.Connection(self.db)
        self.results = []

        # Sample IDs for testing (will be populated from database)
        self.sample_users = []
        self.sample_resources = []
        self.sample_groups = []

    def load_sample_ids(self, sample_size: int = 100):
        """Load random sample of IDs for testing."""
        print("Loading sample IDs for queries...")

        # Sample users
        result = self.conn.execute("MATCH (u:User) RETURN u.id LIMIT 1000")
        all_users = []
        while result.has_next():
            all_users.append(result.get_next()[0])
        self.sample_users = random.sample(all_users, min(sample_size, len(all_users)))

        # Sample resources
        result = self.conn.execute("MATCH (r:Resource) RETURN r.id LIMIT 1000")
        all_resources = []
        while result.has_next():
            all_resources.append(result.get_next()[0])
        self.sample_resources = random.sample(
            all_resources, min(sample_size, len(all_resources))
        )

        # Sample groups
        result = self.conn.execute("MATCH (g:UserGroup) RETURN g.id LIMIT 500")
        all_groups = []
        while result.has_next():
            all_groups.append(result.get_next()[0])
        self.sample_groups = random.sample(
            all_groups, min(sample_size // 2, len(all_groups))
        )

        print(
            f"  ✓ Loaded {len(self.sample_users)} users, "
            f"{len(self.sample_resources)} resources, "
            f"{len(self.sample_groups)} groups"
        )

    def benchmark_query(
        self,
        query_name: str,
        query_template: str,
        params_list: List[Dict],
        warmup: int = 5,
    ) -> QueryResult:
        """
        Benchmark a query with multiple parameter sets.

        Args:
            query_name: Descriptive name for the query
            query_template: Cypher query (can include {param} placeholders)
            params_list: List of parameter dictionaries
            warmup: Number of warmup iterations
        """
        print(f"\n{'='*60}")
        print(f"Benchmarking: {query_name}")
        print("=" * 60)

        if not params_list:
            print("  ⚠️  No parameters provided, skipping")
            return None

        # Warmup
        print(f"Warming up ({warmup} iterations)...")
        for i in range(min(warmup, len(params_list))):
            query = query_template.format(**params_list[i])
            result = self.conn.execute(query)
            # Consume results
            while result.has_next():
                result.get_next()

        # Actual benchmark
        print(f"Running benchmark ({len(params_list)} iterations)...")
        times = []
        total_results = 0

        for params in params_list:
            query = query_template.format(**params)

            start = time.perf_counter()
            result = self.conn.execute(query)

            # Consume all results
            count = 0
            while result.has_next():
                result.get_next()
                count += 1

            elapsed = time.perf_counter() - start
            times.append(elapsed * 1000)  # Convert to milliseconds
            total_results += count

        # Calculate statistics
        times.sort()
        total_time = sum(times) / 1000  # Convert back to seconds
        avg_time = statistics.mean(times)
        min_time = min(times)
        max_time = max(times)
        p50 = times[len(times) // 2]
        p95 = times[int(len(times) * 0.95)]
        p99 = times[int(len(times) * 0.99)]

        result = QueryResult(
            query_name=query_name,
            query=query_template,
            iterations=len(params_list),
            total_time_sec=total_time,
            avg_time_ms=avg_time,
            min_time_ms=min_time,
            max_time_ms=max_time,
            p50_time_ms=p50,
            p95_time_ms=p95,
            p99_time_ms=p99,
            results_count=total_results,
        )

        # Print summary
        print(f"\nResults:")
        print(f"  Iterations: {result.iterations}")
        print(f"  Total time: {result.total_time_sec:.3f}s")
        print(f"  Average: {result.avg_time_ms:.3f}ms")
        print(f"  p50: {result.p50_time_ms:.3f}ms")
        print(f"  p95: {result.p95_time_ms:.3f}ms")
        print(f"  p99: {result.p99_time_ms:.3f}ms")
        print(f"  Min: {result.min_time_ms:.3f}ms")
        print(f"  Max: {result.max_time_ms:.3f}ms")
        print(f"  Avg results: {result.results_count / result.iterations:.1f}")

        self.results.append(result)
        return result

    def run_all_benchmarks(self):
        """Run all authorization query benchmarks."""
        print("\n" + "=" * 60)
        print("KuzuDB Authorization Query Benchmark Suite")
        print("=" * 60)

        self.load_sample_ids()

        # 1. Direct permission check: Does user X have permission Y on resource Z?
        params = [
            {"user_id": user, "resource_id": resource}
            for user, resource in zip(
                random.choices(self.sample_users, k=50),
                random.choices(self.sample_resources, k=50),
            )
        ]
        self.benchmark_query(
            "Direct Permission Check (Read)",
            """MATCH (u:User {{id: '{user_id}'}})-[p:HAS_PERMISSION_USER]->(r:Resource {{id: '{resource_id}'}})
               WHERE p.can_read = true
               RETURN u.id, r.id""",
            params,
        )

        # 2. Group-based permission: Does user have access via groups?
        params = [
            {"user_id": user, "resource_id": resource}
            for user, resource in zip(
                random.choices(self.sample_users, k=50),
                random.choices(self.sample_resources, k=50),
            )
        ]
        self.benchmark_query(
            "Group-Based Permission Check",
            """MATCH (u:User {{id: '{user_id}'}})-[:MEMBER_OF]->(g:UserGroup)-[p:HAS_PERMISSION_GROUP]->(r:Resource {{id: '{resource_id}'}})
               WHERE p.can_read = true
               RETURN u.id, g.id, r.id""",
            params,
        )

        # 3. Combined permission check (direct OR via group)
        params = [
            {"user_id": user, "resource_id": resource}
            for user, resource in zip(
                random.choices(self.sample_users, k=50),
                random.choices(self.sample_resources, k=50),
            )
        ]
        self.benchmark_query(
            "Combined Permission Check (Direct + Group)",
            """MATCH (u:User {{id: '{user_id}'}})
               MATCH (r:Resource {{id: '{resource_id}'}})
               OPTIONAL MATCH (u)-[p1:HAS_PERMISSION_USER]->(r)
               OPTIONAL MATCH (u)-[:MEMBER_OF]->(g:UserGroup)-[p2:HAS_PERMISSION_GROUP]->(r)
               WHERE (p1.can_read = true OR p2.can_read = true)
               RETURN u.id, r.id""",
            params,
        )

        # 4. List all resources user can read
        params = [{"user_id": user} for user in random.choices(self.sample_users, k=30)]
        self.benchmark_query(
            "List User's Readable Resources",
            """MATCH (u:User {{id: '{user_id}'}})
               MATCH (u)-[p:HAS_PERMISSION_USER]->(r:Resource)
               WHERE p.can_read = true
               RETURN r.id, r.type, r.name""",
            params,
        )

        # 5. List all resources user can read (including via groups)
        params = [{"user_id": user} for user in random.choices(self.sample_users, k=30)]
        self.benchmark_query(
            "List User's Readable Resources (Via Groups)",
            """MATCH (u:User {{id: '{user_id}'}})
               MATCH (u)-[:MEMBER_OF]->(g:UserGroup)-[p:HAS_PERMISSION_GROUP]->(r:Resource)
               WHERE p.can_read = true
               RETURN DISTINCT r.id, r.type, r.name""",
            params,
        )

        # 6. Transitive group membership
        params = [{"user_id": user} for user in random.choices(self.sample_users, k=30)]
        self.benchmark_query(
            "User's Groups (Direct Membership)",
            """MATCH (u:User {{id: '{user_id}'}})-[:MEMBER_OF]->(g:UserGroup)
               RETURN g.id, g.name""",
            params,
        )

        # 7. Reverse lookup: Who has access to a resource?
        params = [
            {"resource_id": resource}
            for resource in random.choices(self.sample_resources, k=30)
        ]
        self.benchmark_query(
            "Who Can Read Resource (Direct)",
            """MATCH (u:User)-[p:HAS_PERMISSION_USER]->(r:Resource {{id: '{resource_id}'}})
               WHERE p.can_read = true
               RETURN u.id, u.name""",
            params,
        )

        # 8. Reverse lookup: Groups with access
        params = [
            {"resource_id": resource}
            for resource in random.choices(self.sample_resources, k=30)
        ]
        self.benchmark_query(
            "Which Groups Can Read Resource",
            """MATCH (g:UserGroup)-[p:HAS_PERMISSION_GROUP]->(r:Resource {{id: '{resource_id}'}})
               WHERE p.can_read = true
               RETURN g.id, g.name""",
            params,
        )

        # 9. Check all permissions for a user on a resource
        params = [
            {"user_id": user, "resource_id": resource}
            for user, resource in zip(
                random.choices(self.sample_users, k=30),
                random.choices(self.sample_resources, k=30),
            )
        ]
        self.benchmark_query(
            "Get All Permissions (User on Resource)",
            """MATCH (u:User {{id: '{user_id}'}})-[p:HAS_PERMISSION_USER]->(r:Resource {{id: '{resource_id}'}})
               RETURN p.can_create, p.can_read, p.can_update, p.can_delete""",
            params,
        )

        # 10. Count resources by permission type
        params = [{"user_id": user} for user in random.choices(self.sample_users, k=20)]
        self.benchmark_query(
            "Count User's Resources by Permission",
            """MATCH (u:User {{id: '{user_id}'}})-[p:HAS_PERMISSION_USER]->(r:Resource)
               RETURN 
                   sum(CASE WHEN p.can_create THEN 1 ELSE 0 END) as can_create_count,
                   sum(CASE WHEN p.can_read THEN 1 ELSE 0 END) as can_read_count,
                   sum(CASE WHEN p.can_update THEN 1 ELSE 0 END) as can_update_count,
                   sum(CASE WHEN p.can_delete THEN 1 ELSE 0 END) as can_delete_count""",
            params,
        )

        self.save_results()
        self.print_summary()

    def save_results(self):
        """Save benchmark results to JSON."""
        results_dir = Path(__file__).parent.parent.parent / "results"
        results_dir.mkdir(exist_ok=True)
        output_file = results_dir / "query_benchmark_results.json"

        with open(output_file, "w") as f:
            json.dump([r.to_dict() for r in self.results], f, indent=2)

        print(f"\n📊 Results saved to: {output_file}")

    def print_summary(self):
        """Print summary comparison table."""
        print("\n" + "=" * 60)
        print("Summary: Query Performance")
        print("=" * 60)
        print(f"\n{'Query':<45} {'Avg (ms)':<10} {'p95 (ms)':<10} {'p99 (ms)':<10}")
        print("-" * 75)

        for result in self.results:
            query_name = result.query_name[:44]
            print(
                f"{query_name:<45} "
                f"{result.avg_time_ms:<10.2f} "
                f"{result.p95_time_ms:<10.2f} "
                f"{result.p99_time_ms:<10.2f}"
            )

        # Overall stats
        all_avgs = [r.avg_time_ms for r in self.results]
        all_p95s = [r.p95_time_ms for r in self.results]

        print("-" * 75)
        print(
            f"{'Overall Average':<45} "
            f"{statistics.mean(all_avgs):<10.2f} "
            f"{statistics.mean(all_p95s):<10.2f} "
            f"{'—':<10}"
        )


def main():
    """Run query benchmarks on existing database."""
    import sys

    base_dir = Path(__file__).parent.parent.parent

    # Use the CSV/COPY database by default
    db_path = base_dir / "db" / "bench_csv_copy"

    if not db_path.exists():
        print(f"❌ Database not found at {db_path}")
        print("   Run benchmark_loading.py first to create a database")
        sys.exit(1)

    print(f"Using database: {db_path}")

    benchmark = AuthorizationBenchmark(db_path)
    benchmark.run_all_benchmarks()


if __name__ == "__main__":
    main()
