from sqlalchemy import inspect, text
from DB.database import engine
from typing import Dict, List


class SchemaService:
    """Service to load and cache database schema information."""
    
    _schema_cache: Dict[str, Dict[str, List[str]]] = None
    
    @classmethod
    def load_schema(cls) -> Dict[str, Dict[str, List[str]]]:
        """
        Load all table definitions from PostgreSQL and cache in memory.
        
        Returns:
            Dictionary mapping schema names to table names to column names
            Example: {
                "oms": {
                    "orders": ["order_id", "customer_id", "order_date", ...],
                    "parts": ["part_id", "part_name", "part_number", ...]
                },
                "scheduling": {
                    "part_schedule_status": ["id", "part_id", "status", ...]
                }
            }
        """
        if cls._schema_cache is not None:
            return cls._schema_cache
        
        inspector = inspect(engine)
        schema_info = {}
        
        # Get all schemas
        schemas = inspector.get_schema_names()
        
        # Filter out system schemas
        public_schemas = [
            s for s in schemas 
            if s not in ['information_schema', 'pg_catalog', 'pg_toast']
        ]
        
        for schema in public_schemas:
            schema_info[schema] = {}
            tables = inspector.get_table_names(schema=schema)
            
            for table in tables:
                columns = inspector.get_columns(table_name=table, schema=schema)
                column_names = [col['name'] for col in columns]
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
