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
import { Button } from "../components/ui/button";
import { useToast } from "../components/ui/toast";
import MachineModal from "../Configuration Components/MachineModal";

const Machines = ({ workCenter, onBack }) => {
  const { addToast, ToastContainer } = useToast();
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [machineModalOpen, setMachineModalOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState(null);

  useEffect(() => {
    if (workCenter) {
      fetchMachines();
    }
  }, [workCenter]);

  const fetchMachines = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/machines/work-center/${workCenter.id}`);
      if (response.ok) {
        const data = await response.json();
        setMachines(data);
      } else {
        console.error("Failed to fetch machines:", response.statusText);
        setMachines([]);
      }
    } catch (error) {
      console.error("Error fetching machines:", error);
      setMachines([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const handleAddMachine = () => {
    setEditingMachine(null);
    setMachineModalOpen(true);
  };

  const handleEditMachine = (machine) => {
    setEditingMachine(machine);
    setMachineModalOpen(true);
  };

  const handleDeleteMachine = async (id) => {
    if (window.confirm("Are you sure you want to delete this machine?")) {
      try {
        const response = await fetch(`${API_BASE_URL}/machines/${id}`, {
          method: "DELETE",
        });
        if (response.ok) {
          addToast("Machine deleted successfully", "success");
          fetchMachines();
        } else {
          addToast("Failed to delete machine", "error");
        }
      } catch (error) {
        console.error("Error deleting machine:", error);
        addToast("Error deleting machine", "error");
      }
    }
  };

  const handleMachineSaved = () => {
    setMachineModalOpen(false);
    fetchMachines();
    addToast(
      editingMachine 
        ? "Machine updated successfully" 
        : "Machine created successfully", 
      "success"
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            onClick={onBack}
            className="flex items-center space-x-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
           
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Machines</h1>
            <p className="text-gray-600 mt-1">
              Work Center: <span className="font-medium">{workCenter?.work_center_name}</span>
            </p>
          </div>
        </div>
        <Button
          onClick={handleAddMachine}
          className="bg-gray-900 hover:bg-gray-800"
        >
          Add Machine
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading machines...</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow border border-gray-200">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 border-b-2 border-gray-200">
                <TableHead className="font-semibold text-gray-900 border-r border-gray-200">SL NO</TableHead>
                <TableHead className="font-semibold text-gray-900 border-r border-gray-200">TYPE</TableHead>
                <TableHead className="font-semibold text-gray-900 border-r border-gray-200">MAKE</TableHead>
                <TableHead className="font-semibold text-gray-900 border-r border-gray-200">MODEL</TableHead>
                <TableHead className="font-semibold text-gray-900 border-r border-gray-200">YEAR OF INSTALLATION</TableHead>
                <TableHead className="font-semibold text-gray-900 border-r border-gray-200">CNC CONTROLLER</TableHead>
                <TableHead className="font-semibold text-gray-900 border-r border-gray-200">CNC CONTROLLER SERVICE</TableHead>
                <TableHead className="font-semibold text-gray-900 border-r border-gray-200">REMARKS</TableHead>
                <TableHead className="font-semibold text-gray-900 border-r border-gray-200">CALIBRATION DATE</TableHead>
                <TableHead className="font-semibold text-gray-900 border-r border-gray-200">CALIBRATION DUE DATE</TableHead>
                <TableHead className="font-semibold text-gray-900">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {machines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-gray-500">
                    No machines found for this work center
                  </TableCell>
                </TableRow>
              ) : (
                machines.map((machine, index) => (
                  <TableRow 
                    key={machine.id}
                    className="border-b border-gray-200 hover:bg-blue-50 transition-colors"
                  >
                    <TableCell className="border-r border-gray-200">{index + 1}</TableCell>
                    <TableCell className="border-r border-gray-200 font-medium">{machine.type || "-"}</TableCell>
                    <TableCell className="border-r border-gray-200">{machine.make || "-"}</TableCell>
                    <TableCell className="border-r border-gray-200">{machine.model || "-"}</TableCell>
                    <TableCell className="border-r border-gray-200">{machine.year_of_installation || "-"}</TableCell>
                    <TableCell className="border-r border-gray-200">{machine.cnc_controller || "-"}</TableCell>
                    <TableCell className="border-r border-gray-200">{machine.cnc_controller_service || "-"}</TableCell>
                    <TableCell className="border-r border-gray-200">{machine.remarks || "-"}</TableCell>
                    <TableCell className="border-r border-gray-200">{formatDate(machine.calibration_date)}</TableCell>
                    <TableCell className="border-r border-gray-200">{formatDate(machine.calibration_due_date)}</TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditMachine(machine)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteMachine(machine.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          Delete
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

      {machineModalOpen && (
        <MachineModal
          machine={editingMachine}
          workCenterId={workCenter?.id}
          isOpen={machineModalOpen}
          onClose={() => setMachineModalOpen(false)}
          onSave={handleMachineSaved}
        />
      )}

      <ToastContainer />
    </div>
  );
};

export default Machines;