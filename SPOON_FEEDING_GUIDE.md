# 🥄 SPOON-FEEDING GUIDE: Raw Material System

## 📋 COMPLETE FLOW EXPLANATION

### **🔷 CURRENT SYSTEM STATE**

✅ **13 Materials** with 3 Forms Each (39 Total Stock Items)
- Round: Ø20×1000mm (13 items)
- Square: 25×25×1000mm (13 items)  
- Pipe: Ø25×Ø20×1000mm (13 items)

✅ **Corrected Weight Calculation:**
```
Weight (N) = Total Mass (kg) × 9.81
```

✅ **Total Inventory Value:** ₹194,677.61

---

### **🔷 STEP 1: Database Structure (3 Tables)**

```
┌─────────────────────────────────────────────────────────────┐
│  Table 1: inventory.raw_materials (MASTER)                 │
├─────────────────────────────────────────────────────────────┤
│  id | material_name | density | cost_per_kg               │
│  1  | 45C8          | 7850    | 85.50                     │
│  2  | Aluminium     | 2700    | 185.00                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ has many
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Table 2: inventory.raw_material_stock (ALL STOCK)          │
├─────────────────────────────────────────────────────────────┤
│  id | material_id | form | dimensions | qty | volume |      │
│     | mass | weight | cost | source_type | order_id        │
├─────────────────────────────────────────────────────────────┤
│  1  | 1       | Round| Ø20x1000| 10  | 0.0003|           │
│     | 24.6490| 241.8070| 20674.50| general | NULL           │
├─────────────────────────────────────────────────────────────┤
│  2  | 1       | Square| 25x25x1000| 10 | 0.0006|         │
│     | 49.0630| 481.3080| 41151.83| general | NULL           │
├─────────────────────────────────────────────────────────────┤
│  3  | 1       | Pipe | Ø25xØ20x1000| 10| 0.0002|         │
│     | 13.8970| 136.3300| 11656.22| general | NULL           │
└─────────────────────────────────────────────────────────────┘

**Cost Formula: Cost = Weight × cost_per_kg**

**3 Forms per Material:**
- Round: diameter=20mm, length=1000mm
- Square: breadth=25mm, height=25mm, length=1000mm  
- Pipe: outer_diameter=25mm, inner_diameter=20mm, length=1000mm
                              │
                              │ used by
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Table 3: oms.order_parts_raw_material_linked (USAGE)     │
├─────────────────────────────────────────────────────────────┤
│  id | stock_id | part_id | order_id | used_quantity       │
├─────────────────────────────────────────────────────────────┤
│  1  | 1       | 101     | 1001   | 3                     │
│  2  | 1       | 102     | 1002   | 2                     │
│  3  | 15      | 103     | 1003   | 5                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔶 STEP 2: Data Flow Step-by-Step

### **Scenario: You have 45C8 Steel and 3 Orders need it**

#### **STEP 2.1: Create Material (One Time)**
```python
POST /rawmaterials/
{
  "material_name": "45C8",
  "density": 7850,        # kg/m³
  "cost_per_kg": 85.50    # ₹ per kg
}

Result:
Material ID: 1 created
```

#### **STEP 2.2: Add General Stock (Day 1)**
```python
POST /rawmaterials/stock/
{
  "material_id": 1,
  "form_type": "Round",
  "diameter": 20,        # mm
  "length": 1000,         # mm
  "quantity": 10,
  "source_type": "general",  # ← General stock
  "source_order_id": null
}

System Calculates:
┌─────────────────────────────────────────────────────────────┐
│  Volume = π × (0.01)² × 1 = 0.000314 m³                    │
│  Mass = 7850 × 0.000314 × 10 = 24.649 kg                   │
│  Weight = 24.649 × 9.81 = 241.807 N                        │
│  Cost = 241.807 × 85.50 = ₹20,674.50                     │
└─────────────────────────────────────────────────────────────┘

Result:
Stock ID: 1 created (General Stock, Qty: 10)
```

#### **STEP 2.3: Order 101 Needs 3 Units (Day 5)**
```python
# Option A: Use General Stock
POST /rawmaterials/stock/1/use
{
  "used_quantity": 3
}

System:
┌────────────────────────────────────────────────┐
│  Stock ID 1: 10 → 7 units remaining         │
│  Status: available                            │
└────────────────────────────────────────────────┘

# Create Link (Track Usage)
INSERT INTO order_parts_raw_material_linked
{
  "stock_id": 1,
  "part_id": 101,
  "order_id": 101,
  "used_quantity": 3
}
```

#### **STEP 2.4: Order 102 Needs 2 Units (Day 10)**
```python
# Use Same General Stock
POST /rawmaterials/stock/1/use
{
  "used_quantity": 2
}

System:
┌────────────────────────────────────────────────┐
│  Stock ID 1: 7 → 5 units remaining          │
│  Status: available                            │
└────────────────────────────────────────────────┘

# Create Link
INSERT INTO order_parts_raw_material_linked
{
  "stock_id": 1,
  "part_id": 102,
  "order_id": 102,
  "used_quantity": 2
}
```

#### **STEP 2.5: Order 103 Needs Special Steel (Day 15)**
```python
# This order needs certified steel - Create New Order Stock
POST /rawmaterials/stock/
{
  "material_id": 1,
  "form_type": "Round",
  "diameter": 20,
  "length": 1000,
  "quantity": 8,
  "source_type": "order",     # ← Order-specific
  "source_order_id": 103      # ← Linked to Order 103
}

System:
┌────────────────────────────────────────────────┐
│  Stock ID 15 created (Order 103, Qty: 8)    │
│  Stock ID 1 unchanged (General, Qty: 5)      │
└────────────────────────────────────────────────┘

# Create Link
INSERT INTO order_parts_raw_material_linked
{
  "stock_id": 15,         # ← Uses Order-specific stock
  "part_id": 103,
  "order_id": 103,
  "used_quantity": 8
}
```

---

## 🔷 STEP 3: Final Database State

```sql
SELECT * FROM inventory.raw_material_stock 
WHERE material_id = 1;

┌────┬─────────────┬──────────┬──────────┬─────────┬─────────────┬─────────────┐
│ id │ material_id │ form_type│ quantity │ source  │ source_order│ cost        │
├────┼─────────────┼──────────┼──────────┼─────────┼─────────────┼─────────────┤
│ 1  │ 1           │ Round    │ 5        │ general │ NULL        │ ₹10,537.45  │
│ 15 │ 1           │ Round    │ 8        │ order   │ 103         │ ₹16,859.92  │
└────┴─────────────┴──────────┴──────────┴─────────┴─────────────┴─────────────┘

SELECT * FROM oms.order_parts_raw_material_linked;

┌────┬──────────┬─────────┬──────────┬───────────────┐
│ id │ stock_id │ part_id │ order_id │ used_quantity │
├────┼──────────┼─────────┼──────────┼───────────────┤
│ 1  │ 1        │ 101     │ 101      │ 3             │
│ 2  │ 1        │ 102     │ 102      │ 2             │
│ 3  │ 15       │ 103     │ 103      │ 8             │
└────┴──────────┴─────────┴──────────┴───────────────┘
```

---

## 🔶 STEP 4: How to Display in Frontend

### **Total Stock View**
```
45C8 Steel Round Ø20×1000mm
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total Available: 13 units (₹27,397.37)

Breakdown:
├─ General Stock (ID: 1)
│  ├─ Quantity: 5 units
│  ├─ Mass: 123.25 kg
│  └─ Cost: ₹10,537.45
│
├─ Order 103 (ID: 15)
│  ├─ Quantity: 8 units  ← Reserved for Order 103
│  ├─ Mass: 197.19 kg
│  └─ Cost: ₹16,859.92
│
└─ Total Value: ₹27,397.37

Usage:
├─ Part 101 (Order 101): 3 units from General Stock
├─ Part 102 (Order 102): 2 units from General Stock
└─ Part 103 (Order 103): 8 units from Order Stock
```

---

## 🔷 STEP 5: API Calls for Frontend

### **Get All Stock for Material**
```javascript
// Get stock breakdown for 45C8
GET /api/v1/rawmaterials/stock/?material_id=1

Response:
[
  {
    "id": 1,
    "material_name": "45C8",
    "form_type": "Round",
    "diameter": 20,
    "length": 1000,
    "quantity": 5,
    "source_type": "general",
    "source_order_id": null,
    "source_order_number": null,
    "mass": 123.245,
    "cost": 10537.45,
    "total_mass": 123.245,
    "total_cost": 10537.45
  },
  {
    "id": 15,
    "material_name": "45C8",
    "form_type": "Round",
    "diameter": 20,
    "length": 1000,
    "quantity": 8,
    "source_type": "order",
    "source_order_id": 103,
    "source_order_number": "SO-2024-103",
    "mass": 197.192,
    "cost": 16859.92,
    "total_mass": 197.192,
    "total_cost": 16859.92
  }
]
```

### **Get Total Stock Summary**
```javascript
GET /api/v1/rawmaterials/stock/

// Group by material in frontend
// Calculate totals
```

---

## 🔶 STEP 6: Migration Steps to Add Cost

### **Step 6.1: Add cost_per_kg Column**
```bash
# Run the SQL migration
psql -d your_database -f add_cost_column.sql

# Or use any SQL client to run:
# ALTER TABLE inventory.raw_materials ADD COLUMN cost_per_kg FLOAT NULL;
```

### **Step 6.2: Add Cost Data**
```bash
cd d:\vinod\CMF_DIGITIZATION\backend
python add_cost_per_kg.py
```

### **Step 6.3: Recalculate All Stock Costs**
```bash
cd d:\vinod\CMF_DIGITIZATION\backend
python recalculate_stock_cost.py
```

---

## 🎯 KEY POINTS TO REMEMBER

1. **💰 Cost Calculation**
   ```
   Volume → Mass → Weight → Cost
   
   Volume = Calculate based on form (Round/Square/Pipe)  [m³]
   Mass = Volume × Density × Quantity                      [kg]
   Weight = Mass × 9.81                                    [N]
   Cost = Weight × cost_per_kg                             [₹]
   ```

2. **📦 Stock Structure**
   ```
   13 Materials × 3 Forms = 39 Stock Items
   
   Forms per material:
   - Round: Ø20×1000mm
   - Square: 25×25×1000mm
   - Pipe: Ø25×Ø20×1000mm
   ```

2. **📦 Stock Types**
   ```
   source_type = "general" → Anyone can use
   source_type = "order" → Only that order can use
   ```

3. **🔗 Link Table Purpose**
   ```
   Tracks: Which part used which stock
   Not for: Calculating totals (use stock table for that)
   ```

4. **📊 Display Logic**
   ```
   Total Stock = SUM(quantity) WHERE material_id = X
   
   Breakdown:
   - Group by source_type
   - Show source_order_number for order stock
   - Calculate totals (mass × quantity, cost × quantity)
   ```

---

## ✅ QUICK CHECKLIST

- [ ] Run `add_cost_column.sql` in database
- [ ] Run `python add_cost_per_kg.py`
- [ ] Run `python recalculate_stock_cost.py`
- [ ] Test API: GET /rawmaterials/stock/
- [ ] Verify costs are calculated
- [ ] Update frontend to show breakdown

---

## 🆘 TROUBLESHOOTING

**Error: "cost_per_kg column does not exist"**
→ Run: `add_cost_column.sql` first

**Error: "cost is None"**
→ Check: material.cost_per_kg is set
→ Run: `recalculate_stock_cost.py`

**Question: "How to update cost_per_kg?"**
→ Use: PUT /rawmaterials/{id} with new cost_per_kg
→ Then: Run `recalculate_stock_cost.py`

---

## 📞 EXAMPLE CALCULATIONS

**45C8 Round Ø20×1000mm, 10 units:**
```
Input:
- Diameter: 20mm = 0.02m
- Length: 1000mm = 1m
- Density: 7850 kg/m³
- cost_per_kg: ₹85.50

Calculation:
Volume = π × (0.02/2)² × 1 = 0.000314 m³
Mass = 0.000314 × 7850 × 10 = 24.649 kg
Weight = 24.649 × 9.81 = 241.807 N
Cost = 241.807 × 85.50 = ₹20,674.50
```

**45C8 Square 25×25×1000mm, 10 units:**
```
Input:
- Breadth: 25mm, Height: 25mm, Length: 1000mm
- Density: 7850 kg/m³
- cost_per_kg: ₹85.50

Calculation:
Volume = 0.025 × 0.025 × 1 = 0.000625 m³
Mass = 0.000625 × 7850 × 10 = 49.063 kg
Weight = 49.063 × 9.81 = 481.308 N
Cost = 481.308 × 85.50 = ₹41,151.83
```

**45C8 Pipe Ø25×Ø20×1000mm, 10 units:**
```
Input:
- Outer Diameter: 25mm, Inner Diameter: 20mm, Length: 1000mm
- Density: 7850 kg/m³
- cost_per_kg: ₹85.50

Calculation:
Volume = π × 1 × [(0.025/2)² - (0.020/2)²] = 0.000177 m³
Mass = 0.000177 × 7850 × 10 = 13.897 kg
Weight = 13.897 × 9.81 = 136.330 N
Cost = 136.330 × 85.50 = ₹11,656.22
```
