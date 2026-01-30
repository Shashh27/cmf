# 📁 Frontend Project Structure

## 🚀 Overview
This is a React-based Order Management System (OMS) frontend built with Vite, React Router, Tailwind CSS, and Shadcn UI components.

## 📦 Installation Status ✅

### ✅ Tailwind CSS
- **Version**: 3.4.19 (Latest stable)
- **Status**: ✅ Properly configured
- **Files**: `tailwind.config.js`, `postcss.config.js`

### ✅ Shadcn UI
- **Status**: ✅ Fully installed and configured
- **Components**: Button, Table, Badge
- **Location**: `src/components/ui/`

### ✅ React Router
- **Version**: 7.13.0
- **Status**: ✅ Configured with proper routing

---

## 📂 File Structure

```
frontend/
├── 📄 Configuration Files
│   ├── package.json              # Project dependencies and scripts
│   ├── vite.config.js            # Vite build configuration
│   ├── tailwind.config.js        # Tailwind CSS configuration
│   ├── postcss.config.js         # PostCSS configuration
│   ├── tsconfig.json             # TypeScript configuration
│   └── index.html               # HTML entry point
│
├── 📁 src/                      # Main source code
│   ├── 📄 Main Files
│   │   ├── main.jsx             # React app entry point
│   │   ├── App.jsx              # Main app component with routing
│   │   └── index.css            # Global styles and Tailwind imports
│   │
│   ├── 📁 Components/           # Reusable UI components
│   │   ├── Layout.jsx           # 🏗️ Main layout wrapper (sidebar + content)
│   │   └── 📁 ui/               # 🎨 Shadcn UI components
│   │       ├── button.tsx        # 🔘 Button component
│   │       ├── table.tsx         # 📊 Table component
│   │       ├── badge.tsx        # 🏷️ Badge component
│   │       └── sidebar.jsx      # 📋 Navigation sidebar
│   │
│   ├── 📁 Pages/                # 📄 Page components
│   │   ├── OMS.jsx              # 📦 Order Management System page
│   │   ├── PDM.jsx              # 🏭 Product Data Management page
│   │   ├── PPS.jsx              # ⚙️ Production Planning System page
│   │   └── Test.jsx             # 🧪 Test page for development
│   │
│   ├── 📁 Config/               # ⚙️ Configuration files
│   │   └── auth.js              # 🔐 API configuration (backend URL)
│   │
│   └── 📁 lib/                  # 🔧 Utility libraries
│       └── utils.ts             # 🛠️ Helper functions (cn utility)
│
└── 📁 public/                   # 🌐 Static assets
    └── vite.svg                # Vite logo
```

---

## 🎯 UI Component Mapping

### 📋 Sidebar Navigation
- **File**: `src/Components/ui/sidebar.jsx`
- **Shows**: Navigation menu (OMS, PDM, PPS)
- **Styling**: White background, dark text, blue accent for active item

### 📦 Order Management System (OMS)
- **File**: `src/Pages/OMS.jsx`
- **Shows**: Order table with columns (SL NO, SALE ORDER, CUSTOMER NAME, PRODUCT NAME, QUANTITY, STATUS)
- **Components Used**: Table, Badge, Button
- **Features**: Status badges with colors (Pending=yellow, Shipped=blue, Delivered=green, Cancelled=red)

### 🏭 Product Data Management (PDM)
- **File**: `src/Pages/PDM.jsx`
- **Shows**: Placeholder page for PDM functionality
- **Status**: Ready for development

### ⚙️ Production Planning System (PPS)
- **File**: `src/Pages/PPS.jsx`
- **Shows**: Placeholder page for PPS functionality
- **Status**: Ready for development

---

## 🎨 Styling System

### Tailwind CSS Classes Used
- **Layout**: `flex`, `w-64`, `h-screen`, `fixed`, `ml-64`
- **Colors**: `bg-white`, `bg-gray-100`, `text-gray-900`, `text-gray-700`
- **Typography**: `text-2xl`, `font-bold`, `font-medium`
- **Spacing**: `p-6`, `px-6`, `py-3`, `mt-6`, `ml-3`
- **Effects**: `shadow-xl`, `border-r`, `transition-colors`, `hover:`

### Shadcn UI Components
- **Button**: Styled button with variants
- **Table**: Complete table with header, body, rows, cells
- **Badge**: Status badges with color variants (warning, info, success, destructive)

---

## 🔄 Routing Structure

```
/           → Test Page (development)
/test       → Test Page
/oms        → Order Management System
/pdm        → Product Data Management  
/pps        → Production Planning System
```

---

## 🔧 Configuration

### API Configuration
- **File**: `src/Config/auth.js`
- **Contains**: Backend API URL
- **Usage**: Imported in all pages for API calls

### Build Configuration
- **Tool**: Vite
- **Entry**: `src/main.jsx`
- **Output**: `dist/` folder
- **Dev Server**: `http://localhost:5173`

---

## 🚀 Getting Started

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```

### Build for Production
```bash
npm run build
```

---

## 📝 Development Notes

### ✅ What's Working
- Tailwind CSS styling
- Shadcn UI components
- React Router navigation
- Sidebar with active states
- Order table with status badges
- Mock data for development

### 🔜 Ready for Development
- PDM page functionality
- PPS page functionality
- Real API integration
- Form handling
- Data validation

---

## 🎯 Key Features

1. **🎨 Modern UI**: Clean, professional design with Tailwind CSS
2. **🧩 Component-Based**: Reusable Shadcn UI components
3. **📱 Responsive**: Mobile-friendly design
4. **🔄 Routing**: Client-side navigation with React Router
5. **⚡ Fast Development**: Hot reload with Vite
6. **🏷️ Status System**: Color-coded status badges
7. **📊 Data Display**: Professional table layouts

---

*This structure makes it easy for any developer to understand where each UI element comes from and how to modify it!*
