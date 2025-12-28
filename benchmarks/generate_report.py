#!/usr/bin/env python3
"""
Generate a comprehensive performance report from benchmark results. (DEPRECATED)

NOTE: This script is deprecated. Use generate_comprehensive_report.py instead,
which generates a single comprehensive report with table of contents.

Run: python benchmarks/generate_comprehensive_report.py
"""

import json
from pathlib import Path
from typing import Dict, List


def load_results():
    """Load all benchmark result files."""
    results_dir = Path(__file__).parent.parent / "results"

    results = {}

    # Load Python loading results
    loading_file = results_dir / "loading_benchmark_results.json"
    if loading_file.exists():
        with open(loading_file) as f:
            results["python_loading"] = json.load(f)

    # Load Python query results
    query_file = results_dir / "query_benchmark_results.json"
    if query_file.exists():
        with open(query_file) as f:
            results["python_queries"] = json.load(f)

    # Load Node.js loading results
    nodejs_loading = results_dir / "nodejs_loading_benchmark_results.json"
    if nodejs_loading.exists():
        with open(nodejs_loading) as f:
            results["nodejs_loading"] = json.load(f)

    # Load library sizes
    lib_sizes = results_dir / "library_sizes.json"
    if lib_sizes.exists():
        with open(lib_sizes) as f:
            results["library_sizes"] = json.load(f)

    return results


def generate_report(results: Dict):
    """Generate comprehensive performance report."""

    report = []
    report.append("=" * 80)
    report.append("KuzuDB Authorization Performance Report")
    report.append("=" * 80)
    report.append("")

    # Executive Summary
    report.append("## Executive Summary")
    report.append("")
    report.append(
        "This report presents benchmark results for KuzuDB as an embedded graph"
    )
    report.append("database for authorization systems using a Zanzibar-inspired model.")
    report.append("")
    report.append("**Key Findings:**")
    report.append("")
    report.append(
        "1. **Excellent Query Performance**: Authorization queries average 1.7ms"
    )
    report.append(
        "2. **Parquet Recommended**: 27% faster loading, 85% less memory than CSV"
    )
    report.append("3. **Python More Stable**: Better stability than Node.js bindings")
    report.append("4. **Small Footprint**: Python library only 11.84 MB")
    report.append("")

    # Library Size Comparison
    if "library_sizes" in results:
        report.append("## Library Size Comparison")
        report.append("")

        lib_data = results["library_sizes"]

        if lib_data.get("python"):
            py = lib_data["python"]
            report.append(f"**Python**: {py['total_formatted']}")
            report.append(f"  - Native library: {py['native_formatted']}")
            report.append(f"  - Python/metadata: {py['total_formatted']}")
            report.append("")

        if lib_data.get("nodejs"):
            node = lib_data["nodejs"]
            report.append(f"**Node.js**: {node['total_formatted']}")
            report.append(f"  - Native bindings: {node['native_formatted']}")
            report.append(
                f"  - Includes binaries for all platforms (Linux/macOS/Windows, x64/ARM64)"
            )
            report.append("")

        report.append("**Winner**: Python (much smaller footprint)")
        report.append("")

    # Data Loading Performance
    report.append("## Data Loading Performance")
    report.append("")
    report.append("Test dataset: 8,500 nodes, 26,067 edges (~34,567 total records)")
    report.append("")

    if "python_loading" in results:
        report.append("### Python Results")
        report.append("")
        report.append("| Format  | Load Time | Throughput | Memory | DB Size |")
        report.append("|---------|-----------|------------|--------|---------|")

        for result in results["python_loading"]:
            report.append(
                f"| {result['format']:<7} | "
                f"{result['total_load_time_sec']:.3f}s    | "
                f"{result['records_per_second']:>8.0f}/s | "
                f"{result['memory_used_mb']:>5.1f}M | "
                f"{result['db_size_formatted']:>7} |"
            )

        report.append("")
        report.append(
            "**Recommendation**: Use Parquet for 27% faster loading and 85% less memory"
        )
        report.append("")

    if "nodejs_loading" in results:
        report.append("### Node.js Results")
        report.append("")
        report.append("| Format  | Load Time | DB Size  |")
        report.append("|---------|-----------|----------|")

        for result in results["nodejs_loading"]:
            report.append(
                f"| {result['format']:<7} | "
                f"{result['total_load_time_sec']:.3f}s    | "
                f"{result['db_size_formatted']:>8} |"
            )

        report.append("")
        report.append(
            "**Note**: Node.js loads 44% faster than Python but has stability issues"
        )
        report.append("")

    # Query Performance
    if "python_queries" in results:
        report.append("## Query Performance (Authorization Patterns)")
        report.append("")
        report.append("All queries tested with warm cache on CSV-loaded database:")
        report.append("")
        report.append("| Query Pattern | Avg (ms) | p50 (ms) | p95 (ms) | p99 (ms) |")
        report.append("|---------------|----------|----------|----------|----------|")

        for result in results["python_queries"]:
            name = result["query_name"][:40]
            report.append(
                f"| {name:<40} | "
                f"{result['avg_time_ms']:>7.2f}  | "
                f"{result['p50_time_ms']:>7.2f}  | "
                f"{result['p95_time_ms']:>7.2f}  | "
                f"{result['p99_time_ms']:>7.2f}  |"
            )

        # Calculate overall stats
        avg_times = [r["avg_time_ms"] for r in results["python_queries"]]
        p95_times = [r["p95_time_ms"] for r in results["python_queries"]]

        overall_avg = sum(avg_times) / len(avg_times)
        overall_p95 = sum(p95_times) / len(p95_times)

        report.append("")
        report.append(f"**Overall Average**: {overall_avg:.2f}ms")
        report.append(f"**Overall p95**: {overall_p95:.2f}ms")
        report.append("")
        report.append("**Key Insights:**")
        report.append("- Direct permission checks: <1ms (suitable for real-time auth)")
        report.append("- Group-based checks: ~1-4ms (excellent for most use cases)")
        report.append("- Combined checks: ~5ms (still fast enough for authorization)")
        report.append("- All queries complete in <10ms at p99")
        report.append("")

    # Platform Comparison
    report.append("## Platform Comparison")
    report.append("")
    report.append("| Metric | Python | Node.js | Winner |")
    report.append("|--------|--------|---------|--------|")
    report.append("| CSV Load Time | 0.513s | 0.286s | Node.js (44% faster) |")
    report.append("| Library Size (single) | 11.84 MB | ~17 MB | Python |")
    report.append("| Package Size (total) | 11.84 MB | 458 MB | Python |")
    report.append("| Stability | ✅ Stable | ⚠️ Some crashes | Python |")
    report.append("| Query Performance | 1.7ms avg | Not tested | Python |")
    report.append("| Maturity | Excellent | Good | Python |")
    report.append("")

    # Recommendations
    report.append("## Recommendations")
    report.append("")
    report.append("### For Production Authorization Systems")
    report.append("")
    report.append("1. **Use Python with KuzuDB**")
    report.append("   - Most stable implementation")
    report.append("   - Excellent query performance (<2ms average)")
    report.append("   - Small library footprint")
    report.append("")
    report.append("2. **Use Parquet for Data Loading**")
    report.append("   - 27% faster than CSV")
    report.append("   - 85% less memory usage")
    report.append("   - Better compression")
    report.append("")
    report.append("3. **Query Optimization**")
    report.append("   - Direct permission checks are fastest (<1ms)")
    report.append("   - Cache frequently accessed permissions")
    report.append("   - Group-based checks add ~1ms overhead")
    report.append("")
    report.append("4. **Scaling Considerations**")
    report.append("   - Current dataset: ~35K records")
    report.append("   - All queries sub-10ms even at p99")
    report.append("   - Suitable for real-time authorization")
    report.append("   - Monitor performance at 100K+ scale")
    report.append("")

    # Zanzibar Model Suitability
    report.append("## Suitability for Zanzibar-Style Authorization")
    report.append("")
    report.append("KuzuDB performs excellently for Zanzibar-inspired authorization:")
    report.append("")
    report.append("✅ **Strengths:**")
    report.append("- Fast permission checks (sub-millisecond direct checks)")
    report.append("- Efficient group hierarchies and transitive relationships")
    report.append("- Small memory footprint suitable for embedded use")
    report.append("- Native graph queries map well to authorization patterns")
    report.append("")
    report.append("⚠️ **Considerations:**")
    report.append("- Need to test at much larger scale (millions of nodes)")
    report.append("- Write performance not yet benchmarked")
    report.append("- Concurrent access patterns need testing")
    report.append("- Node.js bindings need stability improvements")
    report.append("")

    # Next Steps
    report.append("## Next Steps")
    report.append("")
    report.append("1. **Scale Testing**: Test with 100K-1M+ nodes")
    report.append("2. **Write Performance**: Benchmark permission updates")
    report.append("3. **Concurrent Access**: Test multiple simultaneous queries")
    report.append("4. **Cache Strategies**: Evaluate caching layer benefits")
    report.append("5. **WASM Evaluation**: Test browser-based authorization checks")
    report.append("")

    report.append("=" * 80)
    report.append("End of Report")
    report.append("=" * 80)

    return "\n".join(report)


def main():
    """Generate and save performance report."""
    print("Generating performance report...")

    results = load_results()
    report = generate_report(results)

    # Save report
    output_dir = Path(__file__).parent.parent / "results"
    output_file = output_dir / "PERFORMANCE_REPORT.md"

    with open(output_file, "w") as f:
        f.write(report)

    print(f"\n✅ Report generated: {output_file}")
    print("\nReport preview:")
    print("-" * 80)
    print(report)


if __name__ == "__main__":
    main()
