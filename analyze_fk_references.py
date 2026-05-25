import pandas as pd
from sqlalchemy import create_engine, text

# Database connection using SQLAlchemy
DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/CMF_Demo"
engine = create_engine(DATABASE_URL)

def get_all_schemas():
    """Get all schemas in the database"""
    query = """
    SELECT schema_name 
    FROM information_schema.schemata 
    WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    ORDER BY schema_name;
    """
    df = pd.read_sql_query(query, engine)
    return df['schema_name'].tolist()

def get_all_tables(schema):
    """Get all tables in a specific schema"""
    query = text("""
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = :schema 
    AND table_type = 'BASE TABLE'
    ORDER BY table_name;
    """)
    df = pd.read_sql_query(query, engine, params={'schema': schema})
    return df['table_name'].tolist()

def get_foreign_keys(schema, table):
    """Get all foreign keys for a specific table"""
    query = text("""
    SELECT
        tc.table_schema,
        tc.table_name,
        kcu.column_name,
        ccu.table_schema AS foreign_table_schema,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        tc.constraint_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = :schema
    AND tc.table_name = :table;
    """)
    df = pd.read_sql_query(query, engine, params={'schema': schema, 'table': table})
    return df

def get_all_columns(schema, table):
    """Get all columns in a table"""
    query = text("""
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = :schema
    AND table_name = :table
    ORDER BY ordinal_position;
    """)
    df = pd.read_sql_query(query, engine, params={'schema': schema, 'table': table})
    return df

def analyze_references():
    """Main function to analyze all references"""
    print("=" * 80)
    print("FOREIGN KEY REFERENCE ANALYSIS FOR PARTS, PART IDs, AND OPERATIONS")
    print("=" * 80)
    print()
    
    # Get all schemas
    schemas = get_all_schemas()
    print(f"Found {len(schemas)} schemas: {schemas}")
    print()
    
    all_fk_data = []
    all_columns_data = []
    
    # Analyze each schema
    for schema in schemas:
        print(f"\n{'=' * 80}")
        print(f"SCHEMA: {schema}")
        print(f"{'=' * 80}")
        
        tables = get_all_tables(schema)
        print(f"Found {len(tables)} tables in schema '{schema}'")
        
        for table in tables:
            # Get foreign keys
            fk_df = get_foreign_keys(schema, table)
            
            if not fk_df.empty:
                # Check if any FK references parts, part_id, or operations
                relevant_fks = fk_df[
                    fk_df['foreign_table_name'].str.contains('part', case=False, na=False) |
                    fk_df['foreign_table_name'].str.contains('operation', case=False, na=False) |
                    fk_df['foreign_column_name'].str.contains('part', case=False, na=False) |
                    fk_df['foreign_column_name'].str.contains('operation', case=False, na=False)
                ]
                
                if not relevant_fks.empty:
                    print(f"\n  Table: {schema}.{table}")
                    for _, row in relevant_fks.iterrows():
                        print(f"    - FK: {row['column_name']} -> {row['foreign_table_schema']}.{row['foreign_table_name']}.{row['foreign_column_name']}")
                        print(f"      Constraint: {row['constraint_name']}")
                        all_fk_data.append({
                            'schema': schema,
                            'table': table,
                            'column': row['column_name'],
                            'foreign_schema': row['foreign_table_schema'],
                            'foreign_table': row['foreign_table_name'],
                            'foreign_column': row['foreign_column_name'],
                            'constraint': row['constraint_name']
                        })
    
    # Also check for columns that might reference parts/operations without explicit FKs
    print(f"\n{'=' * 80}")
    print("CHECKING FOR COLUMNS WITH PART/OPERATION NAMES (NO EXPLICIT FK)")
    print(f"{'=' * 80}")
    
    for schema in schemas:
        tables = get_all_tables(schema)
        for table in tables:
            columns_df = get_all_columns(schema, table)
            relevant_columns = columns_df[
                columns_df['column_name'].str.contains('part|operation', case=False, na=False)
            ]
            
            if not relevant_columns.empty:
                print(f"\n  Table: {schema}.{table}")
                for _, row in relevant_columns.iterrows():
                    print(f"    - Column: {row['column_name']} ({row['data_type']})")
                    all_columns_data.append({
                        'schema': schema,
                        'table': table,
                        'column': row['column_name'],
                        'data_type': row['data_type']
                    })
    
    # Create summary DataFrames
    if all_fk_data:
        summary_df = pd.DataFrame(all_fk_data)
        print(f"\n{'=' * 80}")
        print("SUMMARY OF ALL FOREIGN KEY REFERENCES")
        print(f"{'=' * 80}")
        print(summary_df.to_string(index=False))
        
        # Save to CSV
        output_file = "fk_references_summary.csv"
        summary_df.to_csv(output_file, index=False)
        print(f"\nSummary saved to: {output_file}")
    else:
        print("\nNo foreign key references found for parts or operations.")
    
    if all_columns_data:
        columns_df = pd.DataFrame(all_columns_data)
        columns_output_file = "part_operation_columns_summary.csv"
        columns_df.to_csv(columns_output_file, index=False)
        print(f"\nColumns summary saved to: {columns_output_file}")
    
    return all_fk_data, all_columns_data

if __name__ == "__main__":
    analyze_references()
