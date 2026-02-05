import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "../Config/auth.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import WorkCenterModal from "../Configuration Components/WorkCenterModal";
import Machines from "../Configuration Components/Machines";
import CustomersTable from "../Configuration Components/CustomersTable";
import { useToast } from "../components/ui/toast";

import {
  Pencil,
  Trash2,
  Plus,
  Eye
} from "lucide-react";

const Configuration = () => {
  const { addToast, ToastContainer } = useToast();
  const [workCenters, setWorkCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workCenterModalOpen, setWorkCenterModalOpen] = useState(false);
  const [editingWorkCenter, setEditingWorkCenter] = useState(null);
  const [selectedWorkCenter, setSelectedWorkCenter] = useState(null);
  const [showMachines, setShowMachines] = useState(false);

  useEffect(() => {
    fetchWorkCenters();
  }, []);

  const fetchWorkCenters = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/workcenters/`);
      if (response.ok) {
        const data = await response.json();
        setWorkCenters(data);
      } else {
        console.error("Failed to fetch work centers:", response.statusText);
        setWorkCenters([]);
      }
    } catch (error) {
      console.error("Error fetching work centers:", error);
      setWorkCenters([]);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (workCenter) => {
    setEditingWorkCenter(workCenter);
    setWorkCenterModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this work center?")) {
      try {
        const response = await fetch(`${API_BASE_URL}/workcenters/${id}`, {
          method: "DELETE",
        });
        if (response.ok) {
          addToast("Work center deleted successfully", "success");
          fetchWorkCenters();
        } else {
          addToast("Failed to delete work center", "error");
        }
      } catch (error) {
        console.error("Error deleting work center:", error);
        addToast("Error deleting work center", "error");
      }
    }
  };

  const handleViewMachines = (workCenter) => {
    setSelectedWorkCenter(workCenter);
    setShowMachines(true);
  };

  const handleBackToWorkCenters = () => {
    setShowMachines(false);
    setSelectedWorkCenter(null);
  };

  if (showMachines) {
    return (
      <div>
        <Machines 
          workCenter={selectedWorkCenter}
          onBack={handleBackToWorkCenters}
        />
        <ToastContainer />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Configuration</h1>

      <Tabs defaultValue="work-center" className="w-full">
        <TabsList>
          <TabsTrigger value="work-center">Work Center</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
        </TabsList>

        <TabsContent value="work-center">
          <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Work Center</h2>
              <Button
                size="sm"
                onClick={() => {
                  setEditingWorkCenter(null);
                  setWorkCenterModalOpen(true);
                }}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Work Center
              </Button>
            </div>

            {loading ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-2 text-gray-600">Loading work centers...</p>
              </div>
            ) : (
              <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-gray-300">
                      <TableHead className="font-semibold text-gray-900 bg-gray-50 border-r border-gray-300 text-center whitespace-nowrap px-4 py-3">SL NO</TableHead>
                      <TableHead className="font-semibold text-gray-900 bg-gray-50 border-r border-gray-300 text-center whitespace-nowrap px-4 py-3">CODE</TableHead>
                      <TableHead className="font-semibold text-gray-900 bg-gray-50 border-r border-gray-300 text-center whitespace-nowrap px-4 py-3">WORK CENTER NAME</TableHead>
                      <TableHead className="font-semibold text-gray-900 bg-gray-50 border-r border-gray-300 text-center whitespace-nowrap px-4 py-3">DESCRIPTION</TableHead>
                      <TableHead className="font-semibold text-gray-900 bg-gray-50 border-r border-gray-300 text-center whitespace-nowrap px-4 py-3">IS SCHEDULABLE</TableHead>
                      <TableHead className="font-semibold text-gray-900 bg-gray-50 text-center whitespace-nowrap px-4 py-3">ACTIONS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workCenters.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                          No work centers found
                        </TableCell>
                      </TableRow>
                    ) : (
                      workCenters.map((workCenter, index) => (
                        <TableRow 
                          key={workCenter.id}
                          className="border-b border-gray-300 hover:bg-gray-50 transition-colors"
                        >
                          <TableCell className="border-r border-gray-300 text-center px-4 py-3">{index + 1}</TableCell>
                          <TableCell className="border-r border-gray-300 text-center font-medium px-4 py-3">{workCenter.code}</TableCell>
                          <TableCell className="border-r border-gray-300 text-center px-4 py-3">{workCenter.work_center_name}</TableCell>
                          <TableCell className="border-r border-gray-300 text-center px-4 py-3">{workCenter.description || "-"}</TableCell>
                          <TableCell className="border-r border-gray-300 text-center px-4 py-3">
                            <Badge variant={workCenter.is_schedulable ? "default" : "secondary"}>
                              {workCenter.is_schedulable ? "Yes" : "No"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleViewMachines(workCenter)}
                                title="View Machines"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(workCenter)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(workCenter.id)}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="customers">
          <CustomersTable />
        </TabsContent>
      </Tabs>

      {workCenterModalOpen && (
        <WorkCenterModal
          workCenter={editingWorkCenter}
          isOpen={workCenterModalOpen}
          onClose={() => setWorkCenterModalOpen(false)}
          onSave={() => {
            setWorkCenterModalOpen(false);
            fetchWorkCenters();
            addToast(
              editingWorkCenter 
                ? "Work center updated successfully" 
                : "Work center created successfully", 
              "success"
            );
          }}
        />
      )}

      <ToastContainer />
    </div>
  );
};

export default Configuration;