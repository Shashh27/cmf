# 📏 RAW MATERIAL SYSTEM - UNITS REFERENCE

> **Complete Guide for Notion** | Last Updated: March 31, 2026

---

## 🗄️ DATABASE TABLES

### **Table 1: `inventory.raw_materials` (Master Table)**

| Column | Data Type | Unit | Description |
|--------|-----------|------|-------------|
| `id` | Integer | - | Auto-generated ID |
| `material_name` | String | - | Material name (e.g., "45C8", "SS316L") |
| `density` | Float | **kg/m³** | Mass per cubic meter |
| `cost_per_kg` | Float | **₹/kg** | Cost per kilogram in INR |
| `created_at` | Timestamp | - | Record creation time |
| `updated_at` | Timestamp | - | Last update time |

**Example Materials:**
| Material | Density (kg/m³) | Cost (₹/kg) |
|----------|-----------------|-------------|
| 45C8 | 7,850 | 85.50 |
| SS316L | 8,000 | 245.00 |
| Aluminium | 2,700 | 185.00 |

---

### **Table 2: `inventory.raw_material_stock` (Stock Table)**

| Column | Data Type | Unit | Description |
|--------|-----------|------|-------------|
| `id` | Integer | - | Auto-generated ID |
| `material_id` | Integer | - | FK to raw_materials |
| `form_type` | String | - | "Round", "Square", "Pipe" |
| **Dimensions:** ||||
| `diameter` | Float | **mm** | For Round & Pipe |
| `length` | Float | **mm** | For all forms |
| `breadth` | Float | **mm** | For Square |
| `height` | Float | **mm** | For Square |
| `inner_diameter` | Float | **mm** | For Pipe |
| `outer_diameter` | Float | **mm** | For Pipe |
| **Quantities:** ||||
| `quantity` | Integer | **units/pieces** | Number of items |
| `volume` | Float | **m³** | Single unit volume |
| `mass` | Float | **kg** | Total mass for all units |
| `weight` | Float | **N (Newtons)** | Total weight (mass × 9.81) |
| `cost` | Float | **₹ (INR)** | Total cost (weight × cost_per_kg) |
| **Source:** ||||
| `source_type` | String | - | "general" or "order" |
| `source_order_id` | Integer | - | Order ID if order-specific |
| `status` | String | - | "available" or "exhausted" |

---

### **Table 3: `oms.order_parts_raw_material_linked` (Usage Table)**

| Column | Data Type | Unit | Description |
|--------|-----------|------|-------------|
| `id` | Integer | - | Auto-generated ID |
| `stock_id` | Integer | - | FK to raw_material_stock |
| `part_id` | Integer | - | FK to parts |
| `order_id` | Integer | - | FK to orders |
| `used_quantity` | Integer | **units/pieces** | Quantity used |
| `linkage_group_id` | String | - | Batch grouping ID |
| `user_id` | Integer | - | User who linked |

---

## 🔬 CALCULATION FORMULAS

### **Step 1: Volume Calculation**

| Form | Formula | Input (mm) | Output (m³) |
|------|---------|------------|-------------|
| **Round** | `π × (D/2)² × L` | D=20, L=1000 | 0.000314 |
| **Square** | `L × B × H` | L=1000, B=25, H=25 | 0.000625 |
| **Pipe** | `π × L × [(OD/2)² - (ID/2)²]` | OD=25, ID=20, L=1000 | 0.000177 |

**Note:** All dimensions converted from **mm → m** before calculation

---

### **Step 2: Mass Calculation**

```
Mass (kg) = Volume (m³) × Density (kg/m³) × Quantity (units)
```

**Example (45C8 Round, 10 units):**
| Variable | Value | Unit |
|----------|-------|------|
| Volume | 0.000314 | m³ |
| Density | 7,850 | kg/m³ |
| Quantity | 10 | units |
| **Mass** | **24.649** | **kg** |

---

### **Step 3: Weight Calculation**

```
Weight (N) = Mass (kg) × 9.81 (m/s²)
```

**Example:**
| Variable | Value | Unit |
|----------|-------|------|
| Mass | 24.649 | kg |
| Gravity | 9.81 | m/s² |
| **Weight** | **241.807** | **N** |

---

### **Step 4: Cost Calculation** ⚠️ **IMPORTANT**

```
Cost (₹) = Weight (N) × cost_per_kg (₹/kg)
```

**Example:**
| Variable | Value | Unit |
|----------|-------|------|
| Weight | 241.807 | N |
| cost_per_kg | 85.50 | ₹/kg |
| **Cost** | **20,674.50** | **₹** |

---

## 📊 COMPLETE EXAMPLE: 45C8 Steel

### **Round Ø20×1000mm (10 units)**

| Property | Calculation | Value | Unit |
|----------|-------------|-------|------|
| **Input Dimensions** ||||
| Diameter | - | 20 | mm |
| Length | - | 1000 | mm |
| Quantity | - | 10 | units |
| **Material Properties** ||||
| Density | - | 7,850 | kg/m³ |
| Cost per kg | - | 85.50 | ₹/kg |
| **Calculated Values** ||||
| Volume | π × (0.01)² × 1 | 0.000314 | m³ |
| Mass | 0.000314 × 7850 × 10 | 24.649 | kg |
| Weight | 24.649 × 9.81 | 241.807 | N |
| **Cost** | 241.807 × 85.50 | **20,674.50** | ₹ |

---

### **Square 25×25×1000mm (10 units)**

| Property | Calculation | Value | Unit |
|----------|-------------|-------|------|
| **Input Dimensions** ||||
| Length | - | 1000 | mm |
| Breadth | - | 25 | mm |
| Height | - | 25 | mm |
| Quantity | - | 10 | units |
| **Calculated Values** ||||
| Volume | 0.025 × 0.025 × 1 | 0.000625 | m³ |
| Mass | 0.000625 × 7850 × 10 | 49.063 | kg |
| Weight | 49.063 × 9.81 | 481.308 | N |
| **Cost** | 481.308 × 85.50 | **41,151.83** | ₹ |

---

### **Pipe Ø25×Ø20×1000mm (10 units)**

| Property | Calculation | Value | Unit |
|----------|-------------|-------|------|
| **Input Dimensions** ||||
| Outer Diameter | - | 25 | mm |
| Inner Diameter | - | 20 | mm |
| Length | - | 1000 | mm |
| Quantity | - | 10 | units |
| **Calculated Values** ||||
| Volume | π × 1 × [(0.0125)² - (0.010)²] | 0.000177 | m³ |
| Mass | 0.000177 × 7850 × 10 | 13.897 | kg |
| Weight | 13.897 × 9.81 | 136.330 | N |
| **Cost** | 136.330 × 85.50 | **11,656.22** | ₹ |

---

## 🎯 QUICK REFERENCE CARD

### **INPUTS (Always in mm):**
- `diameter` → mm
- `length` → mm
- `breadth` → mm
- `height` → mm
- `inner_diameter` → mm
- `outer_diameter` → mm
- `quantity` → units/pieces

### **OUTPUTS:**
- `volume` → m³
- `mass` → kg (total for all units)
- `weight` → N (Newtons, total for all units)
- `cost` → ₹ (INR, total for all units)

### **MATERIAL PROPERTIES:**
- `density` → kg/m³
- `cost_per_kg` → ₹/kg

---

## ⚠️ IMPORTANT NOTES

1. **Dimensions Input**: Always in **millimeters (mm)**
2. **Volume Output**: Always in **cubic meters (m³)**
3. **Mass**: **Total kg** for all units (not per unit)
4. **Weight**: **Total Newtons** for all units (mass × 9.81)
5. **Cost Formula**: `Cost = Weight × cost_per_kg` (uses weight, not mass)
6. **Currency**: All costs in **Indian Rupees (₹/INR)**
7. **Total Inventory Value**: ₹1,909,787.87 (for all 39 items)

---

## 🔗 API ENDPOINTS

### **Create Stock Item**
```http
POST /api/v1/rawmaterials/stock/
```

**Request Body:**
```json
{
  "material_id": 1,
  "form_type": "Round",
  "diameter": 20,
  "length": 1000,
  "quantity": 10,
  "source_type": "general"
}
```

**Response:**
```json
{
  "id": 1,
  "material_id": 1,
  "form_type": "Round",
  "diameter": 20,
  "length": 1000,
  "quantity": 10,
  "volume": 0.000314,
  "mass": 24.649,
  "weight": 241.807,
  "cost": 20674.50,
  "source_type": "general",
  "status": "available"
}
```

---

## 🧮 CALCULATION VERIFICATION

### **45C8 Round (Qty: 10)**
```
Step 1: Convert mm → m
  Diameter: 20mm = 0.02m → Radius = 0.01m
  Length: 1000mm = 1m

Step 2: Calculate Volume
  Volume = π × r² × L
  Volume = 3.14159 × (0.01)² × 1
  Volume = 0.000314 m³ ✓

Step 3: Calculate Mass
  Mass = Volume × Density × Quantity
  Mass = 0.000314 × 7850 × 10
  Mass = 24.649 kg ✓

Step 4: Calculate Weight
  Weight = Mass × 9.81
  Weight = 24.649 × 9.81
  Weight = 241.807 N ✓

Step 5: Calculate Cost
  Cost = Weight × cost_per_kg
  Cost = 241.807 × 85.50
  Cost = ₹20,674.50 ✓
```

---

## 📈 SYSTEM STATISTICS

| Metric | Value |
|--------|-------|
| Total Materials | 13 |
| Total Stock Items | 39 (13 × 3 forms) |
| Forms per Material | Round, Square, Pipe |
| Total Inventory Value | ₹1,909,787.87 |

---

**All units are automatically handled by the calculation service!** 🚀
