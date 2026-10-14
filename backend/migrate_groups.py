"""Create the group-planning tables on an existing production database.

Safe to run repeatedly. Execute from the backend directory with the same
DATABASE_URL used by the deployed API, for example in a one-off Render shell.
"""
from app import models
from app.database import engine
from sqlalchemy import inspect, text


def main() -> None:
    # Foreign-key dependency order. checkfirst makes the migration idempotent.
    tables = (
        models.Group.__table__,
        models.GroupMember.__table__,
        models.GroupPayment.__table__,
        models.GroupActivityVote.__table__,
    )
    for table in tables:
        table.create(bind=engine, checkfirst=True)
        print(f"Verified table: {table.name}")

    # Existing deployments may already have groups without the new slug column.
    inspector = inspect(engine)
    if "groups" in inspector.get_table_names():
        columns = {column["name"] for column in inspector.get_columns("groups")}
        if "slug" not in columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE groups ADD COLUMN slug VARCHAR"))
            print("Added groups.slug")
        # Unique indexes permit multiple NULLs, preserving existing groups that
        # predate named links. New groups receive a non-empty unique slug.
        indexes = {index["name"] for index in inspect(engine).get_indexes("groups")}
        if "ix_groups_slug" not in indexes:
            with engine.begin() as connection:
                connection.execute(text("CREATE UNIQUE INDEX ix_groups_slug ON groups (slug)"))
            print("Created unique index ix_groups_slug")
    print("Group-planning schema is ready.")


if __name__ == "__main__":
    main()
