"""
Generate test data for KuzuDB authorization benchmarking.

Creates realistic authorization graph with:
- 5,000 users
- 3,000 resources (documents, folders, projects)
- 500 groups
- ~15K edges (permissions and memberships)

Exports data in multiple formats: CSV, Parquet, JSON
"""

import csv
import json
import random
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Tuple

import pandas as pd
from faker import Faker

# Initialize Faker for realistic data
fake = Faker()
Faker.seed(42)
random.seed(42)

# Configuration
NUM_USERS = 5000
NUM_RESOURCES = 3000
NUM_GROUPS = 500
AVG_MEMBERSHIPS_PER_USER = 2  # Users per group
AVG_USER_PERMISSIONS_PER_RESOURCE = 2
AVG_GROUP_PERMISSIONS_PER_RESOURCE = 1.5
AVG_GROUP_HIERARCHY_DEPTH = 0.3  # 30% of groups inherit from another

RESOURCE_TYPES = ["document", "folder", "project", "api_key", "database"]


def generate_users(num_users: int) -> List[Dict]:
    """Generate user nodes."""
    print(f"Generating {num_users} users...")
    users = []

    for i in range(num_users):
        user_id = f"user_{i:06d}"
        created_at = fake.date_time_between(start_date="-2y", end_date="now")

        users.append(
            {
                "id": user_id,
                "name": fake.name(),
                "email": fake.email(),
                "created_at": created_at.isoformat(),
                "metadata": json.dumps(
                    {"department": fake.job(), "location": fake.city()}
                ),
            }
        )

    print(f"  ✓ Generated {len(users)} users")
    return users


def generate_resources(num_resources: int) -> List[Dict]:
    """Generate resource nodes."""
    print(f"Generating {num_resources} resources...")
    resources = []

    for i in range(num_resources):
        resource_id = f"resource_{i:06d}"
        resource_type = random.choice(RESOURCE_TYPES)
        created_at = fake.date_time_between(start_date="-2y", end_date="now")

        # Generate type-specific names
        if resource_type == "document":
            name = f"{fake.word().capitalize()} {fake.file_name(extension='pdf')}"
        elif resource_type == "folder":
            name = f"/{fake.word()}/{fake.word()}"
        elif resource_type == "project":
            name = f"{fake.company()} - {fake.catch_phrase()}"
        elif resource_type == "api_key":
            name = f"API Key - {fake.word()}"
        else:  # database
            name = f"db_{fake.word()}_{random.randint(1,100)}"

        resources.append(
            {
                "id": resource_id,
                "type": resource_type,
                "name": name,
                "owner_id": f"user_{random.randint(0, min(100, num_resources-1)):06d}",
                "created_at": created_at.isoformat(),
                "metadata": json.dumps({"tags": [fake.word(), fake.word()]}),
            }
        )

    print(f"  ✓ Generated {len(resources)} resources")
    return resources


def generate_groups(num_groups: int) -> List[Dict]:
    """Generate group nodes."""
    print(f"Generating {num_groups} groups...")
    groups = []

    departments = ["Engineering", "Sales", "Marketing", "HR", "Finance", "Operations"]
    teams = ["Alpha", "Beta", "Gamma", "Delta", "Core", "Platform", "Infrastructure"]

    for i in range(num_groups):
        group_id = f"group_{i:04d}"
        created_at = fake.date_time_between(start_date="-2y", end_date="now")

        # Create hierarchical group names
        if random.random() < 0.3:
            name = f"{random.choice(departments)} - {random.choice(teams)}"
        else:
            name = f"{random.choice(departments)}"

        groups.append(
            {
                "id": group_id,
                "name": name,
                "description": fake.bs(),
                "created_at": created_at.isoformat(),
                "metadata": json.dumps({"level": random.randint(1, 5)}),
            }
        )

    print(f"  ✓ Generated {len(groups)} groups")
    return groups


def generate_member_of_edges(users: List[Dict], groups: List[Dict]) -> List[Dict]:
    """Generate MEMBER_OF edges (User -> Group)."""
    print(f"Generating user memberships...")
    edges = []

    # Each user joins 1-4 groups
    for user in users:
        num_memberships = random.randint(1, min(4, len(groups)))
        selected_groups = random.sample(groups, num_memberships)

        for group in selected_groups:
            joined_at = fake.date_time_between(
                start_date=max(
                    datetime.fromisoformat(user["created_at"]),
                    datetime.fromisoformat(group["created_at"]),
                ),
                end_date="now",
            )

            edges.append(
                {
                    "from": user["id"],
                    "to": group["id"],
                    "joined_at": joined_at.isoformat(),
                    "role": random.choice(["member", "member", "member", "admin"]),
                }
            )

    print(f"  ✓ Generated {len(edges)} memberships")
    return edges


def generate_user_permission_edges(
    users: List[Dict], resources: List[Dict]
) -> List[Dict]:
    """Generate HAS_PERMISSION edges (User -> Resource)."""
    print(f"Generating user permissions...")
    edges = []

    # Each resource gets permissions for a few users
    for resource in resources:
        num_permissions = random.randint(1, 5)
        selected_users = random.sample(users, num_permissions)

        for user in selected_users:
            granted_at = fake.date_time_between(
                start_date=max(
                    datetime.fromisoformat(user["created_at"]),
                    datetime.fromisoformat(resource["created_at"]),
                ),
                end_date="now",
            )

            # Random CRUD permissions
            # Owner gets full permissions, others get varied access
            is_owner = user["id"] == resource["owner_id"]

            edges.append(
                {
                    "from": user["id"],
                    "to": resource["id"],
                    "can_create": is_owner or random.random() < 0.3,
                    "can_read": is_owner or random.random() < 0.9,
                    "can_update": is_owner or random.random() < 0.5,
                    "can_delete": is_owner or random.random() < 0.2,
                    "granted_at": granted_at.isoformat(),
                    "granted_by": resource["owner_id"],
                }
            )

    print(f"  ✓ Generated {len(edges)} user permissions")
    return edges


def generate_group_permission_edges(
    groups: List[Dict], resources: List[Dict]
) -> List[Dict]:
    """Generate HAS_PERMISSION edges (Group -> Resource)."""
    print(f"Generating group permissions...")
    edges = []

    # Each resource gets permissions for a few groups
    for resource in resources:
        num_permissions = random.randint(0, 3)
        if num_permissions > 0:
            selected_groups = random.sample(groups, num_permissions)

            for group in selected_groups:
                granted_at = fake.date_time_between(
                    start_date=max(
                        datetime.fromisoformat(group["created_at"]),
                        datetime.fromisoformat(resource["created_at"]),
                    ),
                    end_date="now",
                )

                # Groups typically get broader permissions
                edges.append(
                    {
                        "from": group["id"],
                        "to": resource["id"],
                        "can_create": random.random() < 0.4,
                        "can_read": random.random() < 0.95,
                        "can_update": random.random() < 0.6,
                        "can_delete": random.random() < 0.3,
                        "granted_at": granted_at.isoformat(),
                        "granted_by": resource["owner_id"],
                    }
                )

    print(f"  ✓ Generated {len(edges)} group permissions")
    return edges


def generate_inherits_from_edges(groups: List[Dict]) -> List[Dict]:
    """Generate INHERITS_FROM edges (Group -> Group) for hierarchies."""
    print(f"Generating group hierarchies...")
    edges = []

    # Create parent-child relationships (avoid cycles)
    potential_parents = groups[: len(groups) // 2]  # First half can be parents
    potential_children = groups[len(groups) // 2 :]  # Second half can be children

    for child_group in potential_children:
        if random.random() < AVG_GROUP_HIERARCHY_DEPTH:
            parent_group = random.choice(potential_parents)
            created_at = fake.date_time_between(
                start_date=max(
                    datetime.fromisoformat(child_group["created_at"]),
                    datetime.fromisoformat(parent_group["created_at"]),
                ),
                end_date="now",
            )

            edges.append(
                {
                    "from": child_group["id"],
                    "to": parent_group["id"],
                    "created_at": created_at.isoformat(),
                }
            )

    print(f"  ✓ Generated {len(edges)} group hierarchies")
    return edges


def save_to_csv(data: List[Dict], filepath: Path):
    """Save data to CSV format."""
    if not data:
        return

    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)

    print(f"  ✓ Saved CSV: {filepath.name}")


def save_to_parquet(data: List[Dict], filepath: Path):
    """Save data to Parquet format."""
    if not data:
        return

    df = pd.DataFrame(data)
    df.to_parquet(filepath, engine="pyarrow", compression="snappy")

    print(f"  ✓ Saved Parquet: {filepath.name}")


def save_to_json(data: List[Dict], filepath: Path):
    """Save data to JSON format."""
    if not data:
        return

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    print(f"  ✓ Saved JSON: {filepath.name}")


def main():
    """Generate all test data and export in multiple formats."""
    print("\n" + "=" * 60)
    print("KuzuDB Authorization Test Data Generator")
    print("=" * 60)
    print(f"\nConfiguration:")
    print(f"  Users: {NUM_USERS}")
    print(f"  Resources: {NUM_RESOURCES}")
    print(f"  Groups: {NUM_GROUPS}")
    print(
        f"  Estimated edges: ~{NUM_USERS * AVG_MEMBERSHIPS_PER_USER + NUM_RESOURCES * (AVG_USER_PERMISSIONS_PER_RESOURCE + AVG_GROUP_PERMISSIONS_PER_RESOURCE) + NUM_GROUPS * AVG_GROUP_HIERARCHY_DEPTH:.0f}"
    )
    print()

    # Generate nodes
    users = generate_users(NUM_USERS)
    resources = generate_resources(NUM_RESOURCES)
    groups = generate_groups(NUM_GROUPS)

    # Generate edges
    member_of = generate_member_of_edges(users, groups)
    user_permissions = generate_user_permission_edges(users, resources)
    group_permissions = generate_group_permission_edges(groups, resources)
    inherits_from = generate_inherits_from_edges(groups)

    print(f"\n{'='*60}")
    print("Exporting to multiple formats...")
    print("=" * 60)

    # Get base directory
    base_dir = Path(__file__).parent.parent / "data"

    # Export to CSV
    print("\nCSV Format:")
    csv_dir = base_dir / "csv"
    save_to_csv(users, csv_dir / "users.csv")
    save_to_csv(resources, csv_dir / "resources.csv")
    save_to_csv(groups, csv_dir / "groups.csv")
    save_to_csv(member_of, csv_dir / "member_of.csv")
    save_to_csv(user_permissions, csv_dir / "user_permissions.csv")
    save_to_csv(group_permissions, csv_dir / "group_permissions.csv")
    save_to_csv(inherits_from, csv_dir / "inherits_from.csv")

    # Export to Parquet
    print("\nParquet Format:")
    parquet_dir = base_dir / "parquet"
    save_to_parquet(users, parquet_dir / "users.parquet")
    save_to_parquet(resources, parquet_dir / "resources.parquet")
    save_to_parquet(groups, parquet_dir / "groups.parquet")
    save_to_parquet(member_of, parquet_dir / "member_of.parquet")
    save_to_parquet(user_permissions, parquet_dir / "user_permissions.parquet")
    save_to_parquet(group_permissions, parquet_dir / "group_permissions.parquet")
    save_to_parquet(inherits_from, parquet_dir / "inherits_from.parquet")

    # Export to JSON
    print("\nJSON Format:")
    json_dir = base_dir / "json"
    save_to_json(users, json_dir / "users.json")
    save_to_json(resources, json_dir / "resources.json")
    save_to_json(groups, json_dir / "groups.json")
    save_to_json(member_of, json_dir / "member_of.json")
    save_to_json(user_permissions, json_dir / "user_permissions.json")
    save_to_json(group_permissions, json_dir / "group_permissions.json")
    save_to_json(inherits_from, json_dir / "inherits_from.json")

    # Summary
    total_nodes = len(users) + len(resources) + len(groups)
    total_edges = (
        len(member_of)
        + len(user_permissions)
        + len(group_permissions)
        + len(inherits_from)
    )

    print(f"\n{'='*60}")
    print("Summary")
    print("=" * 60)
    print(f"\nNodes: {total_nodes:,}")
    print(f"  • Users: {len(users):,}")
    print(f"  • Resources: {len(resources):,}")
    print(f"  • Groups: {len(groups):,}")
    print(f"\nEdges: {total_edges:,}")
    print(f"  • MEMBER_OF: {len(member_of):,}")
    print(f"  • HAS_PERMISSION (User): {len(user_permissions):,}")
    print(f"  • HAS_PERMISSION (Group): {len(group_permissions):,}")
    print(f"  • INHERITS_FROM: {len(inherits_from):,}")

    print(f"\n✅ Data generation complete!")
    print(f"\nData exported to:")
    print(f"  • CSV: {csv_dir}")
    print(f"  • Parquet: {parquet_dir}")
    print(f"  • JSON: {json_dir}")


if __name__ == "__main__":
    main()
