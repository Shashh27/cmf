from sqlalchemy import inspect, text
import warnings
from DB.database import engine
from typing import Dict, List

RELEVANT_SCHEMAS = (
    "oms", "scheduling", "inventory", "configuration", "maintenance",
    "quality", "notifications", "production_monitoring", "documents",
    "ems", "accesscontrol",
)


class SchemaService:
    """Service to load and cache database schema information."""
    
    _schema_cache: Dict[str, Dict[str, List[str]]] = None
    
    @classmethod
    def load_schema(cls) -> Dict[str, Dict[str, List[str]]]:
        """
        Load table definitions from the connected PostgreSQL database.
        Auto-discovers application schemas — not hardcoded to one CMF install.
        """
        if cls._schema_cache is not None:
            return cls._schema_cache
        
        inspector = inspect(engine)
        schema_info = {}
        system_schemas = {"pg_catalog", "information_schema", "pg_toast"}

        available = [
            s for s in inspector.get_schema_names()
            if s not in system_schemas
        ]
        # Prefer known CMF schemas first, then any other schemas in the DB
        schemas_to_load = list(RELEVANT_SCHEMAS)
        for s in available:
            if s not in schemas_to_load:
                schemas_to_load.append(s)
        
        for schema in schemas_to_load:
            if schema not in available:
                continue
            schema_info[schema] = {}
            tables = inspector.get_table_names(schema=schema)
            
            for table in tables:
                if table.startswith("pg_"):
                    continue
                with warnings.catch_warnings():
                    warnings.filterwarnings(
                        "ignore",
                        message="Did not recognize type",
                        category=Warning,
                    )
                    columns = inspector.get_columns(table_name=table, schema=schema)
                column_names = [col["name"] for col in columns]
                schema_info[schema][table] = column_names
        
        cls._schema_cache = schema_info
        return schema_info
    
    @classmethod
    def get_schema_string(cls) -> str:
        """
        Get the schema information as a formatted string for LLM prompt.
        
        Returns:
            Formatted string describing all schemas, tables, and columns
        """
        schema = cls.load_schema()
        lines = []
        
        for schema_name, tables in schema.items():
            lines.append(f"\nSchema: {schema_name}")
            for table_name, columns in tables.items():
                columns_str = ", ".join(columns)
                lines.append(f"  Table: {table_name} - Columns: {columns_str}")
        
        return "\n".join(lines)
    
    @classmethod
    def refresh_cache(cls):
        """Force refresh the schema cache."""
        cls._schema_cache = None
        cls.load_schema()
