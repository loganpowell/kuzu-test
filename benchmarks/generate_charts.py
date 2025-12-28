#!/usr/bin/env python3
"""
Generate a simple comparison chart for loading performance. (DEPRECATED)

NOTE: Use generate_comprehensive_report.py instead, which includes charts
in a single comprehensive report with table of contents.
"""

import json
from pathlib import Path


def create_bar_chart(data, max_width=50):
    """Create a simple ASCII bar chart."""
    max_value = max(d["value"] for d in data)

    lines = []
    for item in data:
        bar_length = int((item["value"] / max_value) * max_width)
        bar = "█" * bar_length
        lines.append(f"{item['label']:<25} {bar} {item['display']}")

    return "\n".join(lines)


def main():
    results_dir = Path(__file__).parent.parent / "results"

    # Load Python loading results
    with open(results_dir / "loading_benchmark_results.json") as f:
        python_data = json.load(f)

    # Load Node.js loading results
    with open(results_dir / "nodejs_loading_benchmark_results.json") as f:
        nodejs_data = json.load(f)

    # Load query results
    with open(results_dir / "query_benchmark_results.json") as f:
        query_data = json.load(f)

    output = []
    output.append("=" * 80)
    output.append("KuzuDB Performance Charts")
    output.append("=" * 80)
    output.append("")

    # Loading Time Chart
    output.append("LOADING TIME (seconds, lower is better)")
    output.append("-" * 80)

    loading_chart_data = []
    for result in python_data:
        loading_chart_data.append(
            {
                "label": f"Python + {result['format'].upper()}",
                "value": result["total_load_time_sec"],
                "display": f"{result['total_load_time_sec']:.3f}s",
            }
        )

    for result in nodejs_data:
        loading_chart_data.append(
            {
                "label": f"Node.js + {result['format'].upper()}",
                "value": result["total_load_time_sec"],
                "display": f"{result['total_load_time_sec']:.3f}s",
            }
        )

    output.append(create_bar_chart(loading_chart_data))
    output.append("")
    output.append("")

    # Throughput Chart
    output.append("LOADING THROUGHPUT (records/sec, higher is better)")
    output.append("-" * 80)

    throughput_data = []
    for result in python_data:
        throughput_data.append(
            {
                "label": f"Python + {result['format'].upper()}",
                "value": result["records_per_second"],
                "display": f"{result['records_per_second']:,.0f} rec/s",
            }
        )

    output.append(create_bar_chart(throughput_data))
    output.append("")
    output.append("")

    # Memory Chart
    output.append("MEMORY USAGE DURING LOAD (MB, lower is better)")
    output.append("-" * 80)

    memory_data = []
    for result in python_data:
        memory_data.append(
            {
                "label": f"Python + {result['format'].upper()}",
                "value": result["memory_used_mb"],
                "display": f"{result['memory_used_mb']:.1f} MB",
            }
        )

    output.append(create_bar_chart(memory_data))
    output.append("")
    output.append("")

    # Query Performance Chart
    output.append("QUERY PERFORMANCE (milliseconds, lower is better)")
    output.append("-" * 80)

    query_chart_data = []
    for result in sorted(query_data, key=lambda x: x["avg_time_ms"])[:10]:
        name = result["query_name"][:40]
        query_chart_data.append(
            {
                "label": name,
                "value": result["avg_time_ms"],
                "display": f"{result['avg_time_ms']:.2f}ms",
            }
        )

    output.append(create_bar_chart(query_chart_data))
    output.append("")

    # Save chart
    chart_file = results_dir / "PERFORMANCE_CHARTS.md"
    with open(chart_file, "w") as f:
        f.write("\n".join(output))

    print(f"✅ Charts generated: {chart_file}")
    print("\nCharts preview:")
    print("-" * 80)
    print("\n".join(output))


if __name__ == "__main__":
    main()
