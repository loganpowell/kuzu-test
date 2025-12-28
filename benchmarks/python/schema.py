"""
Schema definitions for KuzuDB authorization testing.
Implements a Zanzibar-inspired authorization model.
"""

import kuzu


def create_schema(db_path: str) -> kuzu.Database:
    """
    Create the authorization schema with nodes and relationships.

    Schema:
    - User nodes: represent users in the system
    - Resource nodes: represent resources (documents, folders, projects)
    - Group nodes: represent groups of users

    Relationships:
    - MEMBER_OF: User -> Group (user membership)
    - HAS_PERMISSION: User/Group -> Resource (direct permissions with CRUD flags)
    - INHERITS_FROM: Group -> Group (nested group hierarchies)

    Args:
        db_path: Path to the KuzuDB database directory

    Returns:
        Database instance with schema created
    """
    db = kuzu.Database(db_path)
    conn = kuzu.Connection(db)

    print("Creating KuzuDB schema for authorization...")

    # Create User node table
    conn.execute(
        """
        CREATE NODE TABLE User(
            id STRING,
            name STRING,
            email STRING,
            created_at TIMESTAMP,
            metadata STRING,
            PRIMARY KEY (id)
        )
    """
    )
    print("✓ Created User node table")

    # Create Resource node table
    conn.execute(
        """
        CREATE NODE TABLE Resource(
            id STRING,
            type STRING,
            name STRING,
            owner_id STRING,
            created_at TIMESTAMP,
            metadata STRING,
            PRIMARY KEY (id)
        )
    """
    )
    print("✓ Created Resource node table")

    # Create UserGroup node table
    conn.execute(
        """
        CREATE NODE TABLE UserGroup(
            id STRING,
            name STRING,
            description STRING,
            created_at TIMESTAMP,
            metadata STRING,
            PRIMARY KEY (id)
        )
    """
    )
    print("✓ Created UserGroup node table")

    # Create MEMBER_OF relationship (User -> UserGroup)
    conn.execute(
        """
        CREATE REL TABLE MEMBER_OF(
            FROM User TO UserGroup,
            joined_at TIMESTAMP,
            role STRING
        )
    """
    )
    print("✓ Created MEMBER_OF relationship table")

    # Create HAS_PERMISSION relationship (User -> Resource, Group -> Resource)
    # Permissions: create, read, update, delete (CRUD)
    conn.execute(
        """
        CREATE REL TABLE HAS_PERMISSION_USER(
            FROM User TO Resource,
            can_create BOOLEAN,
            can_read BOOLEAN,
            can_update BOOLEAN,
            can_delete BOOLEAN,
            granted_at TIMESTAMP,
            granted_by STRING
        )
    """
    )
    print("✓ Created HAS_PERMISSION_USER relationship table")

    conn.execute(
        """
        CREATE REL TABLE HAS_PERMISSION_GROUP(
            FROM UserGroup TO Resource,
            can_create BOOLEAN,
            can_read BOOLEAN,
            can_update BOOLEAN,
            can_delete BOOLEAN,
            granted_at TIMESTAMP,
            granted_by STRING
        )
    """
    )
    print("✓ Created HAS_PERMISSION_GROUP relationship table")

    # Create INHERITS_FROM relationship (UserGroup -> UserGroup)
    # For nested group hierarchies
    conn.execute(
        """
        CREATE REL TABLE INHERITS_FROM(
            FROM UserGroup TO UserGroup,
            created_at TIMESTAMP
        )
    """
    )
    print("✓ Created INHERITS_FROM relationship table")

    print("\n✅ Schema created successfully!")

    return db, conn


def print_schema_info(conn: kuzu.Connection):
    """Print information about the created schema."""
    print("\n" + "=" * 60)
    print("Schema Information")
    print("=" * 60)

    # Get node tables
    result = conn.execute("CALL SHOW_TABLES() RETURN *;")
    tables = []
    while result.has_next():
        tables.append(result.get_next())

    print(f"\nTotal tables: {len(tables)}")
    for table in tables:
        print(f"  - {table}")

    print("\nNode Tables:")
    print("  • User - system users")
    print("  • Resource - protected resources (documents, folders, etc.)")
    print("  • UserGroup - user groups")

    print("\nRelationship Tables:")
    print("  • MEMBER_OF: User → UserGroup")
    print("  • HAS_PERMISSION_USER: User → Resource")
    print("  • HAS_PERMISSION_GROUP: UserGroup → Resource")
    print("  • INHERITS_FROM: UserGroup → UserGroup")

    print("\n" + "=" * 60)


if __name__ == "__main__":
    import sys
    import shutil
    from pathlib import Path

    # Database path
    db_path = Path(__file__).parent.parent / "db" / "auth_test"

    # Remove existing database if it exists
    if db_path.exists():
        print(f"⚠️  Removing existing database at {db_path}")
        shutil.rmtree(db_path)

    # Create schema
    db, conn = create_schema(str(db_path))

    # Print schema information
    print_schema_info(conn)

    print(f"\n✅ Database ready at: {db_path}")
