import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const Navbar = () => {
  const location = useLocation();
  
  return (
    <header className="bg-blue-50 border-b border-blue-100 shadow-sm fixed top-0 right-0 left-56 z-40">
      <div className="px-6 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-1">
          <h1 className="text-lg font-medium text-gray-800">
            {location.pathname === '/oms/orders' && 'Orders'}
            {location.pathname === '/oms/rawmaterials' && 'Raw Materials'}
            {location.pathname === '/pdm' && 'Product Data Management'}
            {location.pathname === '/pps' && 'Production Planning System'}
            {location.pathname === '/configuration' && 'Configuration'}
          </h1>
        </div>
        
        <div className="flex items-center space-x-4">
          <button className="p-1.5 rounded-full text-gray-500 hover:bg-blue-50 hover:text-blue-600 focus:outline-none transition-colors">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </button>
          
          <div className="relative">
            <button className="flex items-center space-x-2 focus:outline-none group">
              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-medium group-hover:bg-blue-200 transition-colors">
                U
              </div>
              <span className="text-sm font-medium text-gray-700 group-hover:text-blue-700 transition-colors">User</span>
              <svg className="h-4 w-4 text-gray-500 group-hover:text-blue-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
