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
        Load table definitions from application PostgreSQL schemas only.
        Skips system catalogs to avoid regtype/regrole SAWarnings.
        """
        if cls._schema_cache is not None:
            return cls._schema_cache
        
        inspector = inspect(engine)
        schema_info = {}
        
        for schema in RELEVANT_SCHEMAS:
            if schema not in inspector.get_schema_names():
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
