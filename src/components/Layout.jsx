import React from "react";
import Sidebar from "./ui/sidebar";
import Navbar from "./ui/Navbar";

const Layout = ({ children }) => {
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 ml-56 flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <main className="flex-1 overflow-y-auto px-6 py-4 mt-14">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};

export default Layout;
