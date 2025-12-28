"""
Benchmark data loading performance in KuzuDB.

Tests different file formats (CSV, Parquet, JSON) and loading methods
(COPY FROM vs LOAD FROM) to determine optimal approach for authorization data.
"""

import time
import shutil
import psutil
import json
from pathlib import Path
from typing import Dict, List, Tuple

import kuzu


class MemoryMonitor:
    """Monitor memory usage during operations."""

    def __init__(self):
        self.process = psutil.Process()
        self.baseline = None

    def start(self):
        """Record baseline memory usage."""
        self.baseline = self.process.memory_info().rss

    def get_current_mb(self) -> float:
        """Get current memory usage in MB."""
        return self.process.memory_info().rss / (1024 * 1024)

    def get_delta_mb(self) -> float:
        """Get memory increase since baseline in MB."""
        if self.baseline is None:
            return 0
        current = self.process.memory_info().rss
        return (current - self.baseline) / (1024 * 1024)


def get_directory_size(path: Path) -> int:
    """Calculate total size of directory in bytes."""
    total = 0
    for item in path.rglob("*"):
        if item.is_file():
            total += item.stat().st_size
    return total


def format_size(bytes_size: int) -> str:
    """Format bytes to human-readable string."""
    for unit in ["B", "KB", "MB", "GB"]:
        if bytes_size < 1024.0:
            return f"{bytes_size:.2f} {unit}"
        bytes_size /= 1024.0
    return f"{bytes_size:.2f} TB"


class LoadingBenchmark:
    """Benchmark data loading performance."""

    def __init__(self, base_dir: Path):
        self.base_dir = base_dir
        self.data_dir = base_dir / "data"
        self.db_base = base_dir / "db"
        self.results_dir = base_dir / "results"
        self.results_dir.mkdir(exist_ok=True)
        self.results = []

    def create_fresh_db(self, db_name: str) -> Tuple[kuzu.Database, kuzu.Connection]:
        """Create a fresh database with schema."""
        db_path = self.db_base / db_name

        # Remove if exists
        if db_path.exists():
            shutil.rmtree(db_path)

        # Create database and schema
        db = kuzu.Database(str(db_path))
        conn = kuzu.Connection(db)

        # Create schema (same as schema.py)
        conn.execute(
            """
            CREATE NODE TABLE User(
                id STRING, name STRING, email STRING,
                created_at TIMESTAMP, metadata STRING,
                PRIMARY KEY (id)
            )
        """
        )

        conn.execute(
            """
            CREATE NODE TABLE Resource(
                id STRING, type STRING, name STRING,
                owner_id STRING, created_at TIMESTAMP, metadata STRING,
                PRIMARY KEY (id)
            )
        """
        )

        conn.execute(
            """
            CREATE NODE TABLE UserGroup(
                id STRING, name STRING, description STRING,
                created_at TIMESTAMP, metadata STRING,
                PRIMARY KEY (id)
            )
        """
        )

        conn.execute(
            """
            CREATE REL TABLE MEMBER_OF(
                FROM User TO UserGroup,
                joined_at TIMESTAMP, role STRING
            )
        """
        )

        conn.execute(
            """
            CREATE REL TABLE HAS_PERMISSION_USER(
                FROM User TO Resource,
                can_create BOOLEAN, can_read BOOLEAN,
                can_update BOOLEAN, can_delete BOOLEAN,
                granted_at TIMESTAMP, granted_by STRING
            )
        """
        )

        conn.execute(
            """
            CREATE REL TABLE HAS_PERMISSION_GROUP(
                FROM UserGroup TO Resource,
                can_create BOOLEAN, can_read BOOLEAN,
                can_update BOOLEAN, can_delete BOOLEAN,
                granted_at TIMESTAMP, granted_by STRING
            )
        """
        )

        conn.execute(
            """
            CREATE REL TABLE INHERITS_FROM(
                FROM UserGroup TO UserGroup,
                created_at TIMESTAMP
            )
        """
        )

        return db, conn

    def benchmark_load(self, format_type: str, method: str) -> Dict:
        """
        Benchmark loading data with specific format and method.

        Args:
            format_type: 'csv', 'parquet', or 'json'
            method: 'copy' or 'load'
        """
        print(f"\n{'='*60}")
        print(f"Benchmarking: {format_type.upper()} with {method.upper()}")
        print("=" * 60)

        db_name = f"bench_{format_type}_{method}"
        mem_monitor = MemoryMonitor()
        mem_monitor.start()

        # Create fresh database
        print("Creating fresh database with schema...")
        start_time = time.time()
        db, conn = self.create_fresh_db(db_name)
        schema_time = time.time() - start_time
        print(f"  ✓ Schema created in {schema_time:.3f}s")

        # Data directory
        data_path = self.data_dir / format_type

        # Prepare COPY/LOAD statements
        extension = format_type if format_type != "parquet" else "parquet"
        command = "COPY" if method == "copy" else "LOAD FROM"

        tables = [
            ("User", "users"),
            ("Resource", "resources"),
            ("UserGroup", "groups"),
            ("MEMBER_OF", "member_of"),
            ("HAS_PERMISSION_USER", "user_permissions"),
            ("HAS_PERMISSION_GROUP", "group_permissions"),
            ("INHERITS_FROM", "inherits_from"),
        ]

        # Load data
        print(f"\nLoading data using {method.upper()}...")
        load_times = {}
        total_load_start = time.time()

        for table_name, file_name in tables:
            file_path = data_path / f"{file_name}.{extension}"

            if not file_path.exists():
                print(f"  ⚠️  Skipping {table_name}: file not found")
                continue

            start = time.time()

            if method == "copy":
                conn.execute(f'{command} {table_name} FROM "{file_path}"')
            else:  # load
                conn.execute(f'{command} "{file_path}" RETURN *')

            elapsed = time.time() - start
            load_times[table_name] = elapsed
            print(f"  ✓ {table_name}: {elapsed:.3f}s")

        total_load_time = time.time() - total_load_start

        # Get database size
        db_path = self.db_base / db_name
        db_size = get_directory_size(db_path)

        # Get memory usage
        memory_used = mem_monitor.get_delta_mb()

        # Count records
        print("\nCounting records...")
        counts = {}
        for table_name, _ in tables:
            try:
                result = conn.execute(f"MATCH (n:{table_name}) RETURN count(*)")
                if result.has_next():
                    counts[table_name] = result.get_next()[0]
            except:
                try:
                    result = conn.execute(
                        f"MATCH ()-[r:{table_name}]->() RETURN count(*)"
                    )
                    if result.has_next():
                        counts[table_name] = result.get_next()[0]
                except:
                    counts[table_name] = 0

        total_records = sum(counts.values())
        print(f"  ✓ Total records: {total_records:,}")

        # Compile results
        result = {
            "format": format_type,
            "method": method,
            "schema_time_sec": schema_time,
            "total_load_time_sec": total_load_time,
            "table_load_times_sec": load_times,
            "db_size_bytes": db_size,
            "db_size_formatted": format_size(db_size),
            "memory_used_mb": memory_used,
            "record_counts": counts,
            "total_records": total_records,
            "records_per_second": (
                total_records / total_load_time if total_load_time > 0 else 0
            ),
        }

        self.results.append(result)

        # Print summary
        print(f"\n{'='*60}")
        print("Summary")
        print("=" * 60)
        print(f"Total load time: {total_load_time:.3f}s")
        print(f"Database size: {format_size(db_size)}")
        print(f"Memory used: {memory_used:.2f} MB")
        print(f"Records loaded: {total_records:,}")
        print(f"Throughput: {result['records_per_second']:.0f} records/sec")

        # Cleanup connection
        conn.close()

        return result

    def run_all_benchmarks(self):
        """Run all combinations of formats and methods."""
        formats = ["csv", "parquet"]  # JSON typically slower for large datasets
        methods = ["copy"]  # Start with COPY, add LOAD if needed

        print("\n" + "=" * 60)
        print("KuzuDB Loading Benchmark Suite")
        print("=" * 60)
        print(f"\nFormats: {', '.join(f.upper() for f in formats)}")
        print(f"Methods: {', '.join(m.upper() for m in methods)}")

        for format_type in formats:
            for method in methods:
                try:
                    self.benchmark_load(format_type, method)
                except Exception as e:
                    print(f"\n❌ Error benchmarking {format_type}/{method}: {e}")
                    import traceback

                    traceback.print_exc()

        # Save results
        self.save_results()
        self.print_comparison()

    def save_results(self):
        """Save benchmark results to JSON."""
        output_file = self.results_dir / "loading_benchmark_results.json"
        with open(output_file, "w") as f:
            json.dump(self.results, f, indent=2)
        print(f"\n📊 Results saved to: {output_file}")

    def print_comparison(self):
        """Print comparison table of all results."""
        if not self.results:
            return

        print("\n" + "=" * 60)
        print("Comparison")
        print("=" * 60)
        print(
            f"\n{'Format':<10} {'Method':<8} {'Load Time':<12} {'DB Size':<12} {'Memory':<10} {'Records/s':<12}"
        )
        print("-" * 60)

        for result in self.results:
            print(
                f"{result['format']:<10} "
                f"{result['method']:<8} "
                f"{result['total_load_time_sec']:<12.3f} "
                f"{result['db_size_formatted']:<12} "
                f"{result['memory_used_mb']:<10.2f} "
                f"{result['records_per_second']:<12.0f}"
            )


def main():
    """Run loading benchmarks."""
    base_dir = Path(__file__).parent.parent.parent
    benchmark = LoadingBenchmark(base_dir)
    benchmark.run_all_benchmarks()


if __name__ == "__main__":
    main()
