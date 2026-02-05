import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "../../lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import cmtisLogo from "../../assets/cmtis.png";

const Sidebar = () => {
  const location = useLocation();
  const isOmsActive = location.pathname.startsWith("/oms");
  const [omsExpanded, setOmsExpanded] = useState(isOmsActive);

  useEffect(() => {
    if (isOmsActive) setOmsExpanded(true);
  }, [isOmsActive]);

  const omsIcon = (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
      />
    </svg>
  );

  const menuItems = [
    {
      title: "PDM",
      path: "/pdm",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          />
        </svg>
      ),
    },
    {
      title: "PPS",
      path: "/pps",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
    },
    {
      title: "Configuration",
      path: "/configuration",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      ),
    },
  ];

  return (
    <div className="w-56 bg-blue-50 text-gray-800 h-screen fixed left-0 top-0 z-50 shadow-lg">
      <div className="p-3 border-b border-blue-100 flex items-center justify-center">
        <img 
          src={cmtisLogo} 
          alt="CMTIS Logo" 
          className="h-10 w-auto"
        />
      </div>
      <nav className="mt-4">
        {/* OMS with sub-menus */}
        <div className="px-2 py-1">
          <button
            onClick={() => setOmsExpanded(!omsExpanded)}
            className={cn(
              "flex items-center w-full px-3 py-2 text-sm text-gray-700 hover:bg-blue-100 hover:text-blue-800 transition-colors duration-200 rounded-md",
              isOmsActive && "bg-blue-100 text-blue-800 font-medium"
            )}
          >
            {React.cloneElement(omsIcon, { className: 'w-5 h-5 text-blue-600' })}
            <span className="ml-2.5 font-medium flex-1 text-left">OMS</span>
            {omsExpanded ? (
              <ChevronDown className="w-4 h-4 text-blue-600" />
            ) : (
              <ChevronRight className="w-4 h-4 text-blue-600" />
            )}
          </button>
          {omsExpanded && (
            <div className="ml-6 mt-1 space-y-1">
              <Link
                to="/oms/orders"
                className={cn(
                  "flex items-center px-4 py-2 text-sm text-gray-600 hover:bg-blue-50 hover:text-blue-800 transition-colors duration-200 rounded-md",
                  location.pathname.startsWith("/oms/orders") && "bg-blue-50 text-blue-800 font-medium"
                )}
              >
                Orders
              </Link>
              <Link
                to="/oms/rawmaterials"
                className={cn(
                  "flex items-center px-4 py-2 text-sm text-gray-600 hover:bg-blue-50 hover:text-blue-800 transition-colors duration-200 rounded-md",
                  location.pathname === "/oms/rawmaterials" && "bg-blue-50 text-blue-800 font-medium"
                )}
              >
                Raw Materials
              </Link>
            </div>
          )}
        </div>
        <div className="px-2 py-1">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center w-full px-3 py-2 text-sm text-gray-700 hover:bg-blue-100 hover:text-blue-800 transition-colors duration-200 rounded-md mb-1",
                location.pathname === item.path && "bg-blue-100 text-blue-800 font-medium"
              )}
            >
              {React.cloneElement(item.icon, { className: 'w-5 h-5 text-blue-600' })}
              <span className="ml-2.5 font-medium">{item.title}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default Sidebar;
