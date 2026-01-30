import React from "react";
import Sidebar from "./ui/sidebar";

const Layout = ({ children }) => {
  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 ml-64">
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
