import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "../Config/auth.js";
import { Button } from "../components/ui/button";

const MachineModal = ({ machine, workCenterId, isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    work_center_id: workCenterId || "",
    type: "",
    make: "",
    model: "",
    year_of_installation: "",
    cnc_controller: "",
    cnc_controller_service: "",
    remarks: "",
    calibration_date: "",
    calibration_due_date: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (machine) {
      setFormData({
        work_center_id: machine.work_center_id || workCenterId,
        type: machine.type || "",
        make: machine.make || "",
        model: machine.model || "",
        year_of_installation: machine.year_of_installation || "",
        cnc_controller: machine.cnc_controller || "",
        cnc_controller_service: machine.cnc_controller_service || "",
        remarks: machine.remarks || "",
        calibration_date: machine.calibration_date ? machine.calibration_date.split('T')[0] : "",
        calibration_due_date: machine.calibration_due_date ? machine.calibration_due_date.split('T')[0] : "",
      });
    } else {
      setFormData({
        work_center_id: workCenterId || "",
        type: "",
        make: "",
        model: "",
        year_of_installation: "",
        cnc_controller: "",
        cnc_controller_service: "",
        remarks: "",
        calibration_date: "",
        calibration_due_date: "",
      });
    }
  }, [machine, workCenterId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Prepare data with proper types
    const submitData = {
      work_center_id: parseInt(formData.work_center_id),
      type: formData.type,
      make: formData.make,
      model: formData.model,
      year_of_installation: formData.year_of_installation ? parseInt(formData.year_of_installation) : null,
      cnc_controller: formData.cnc_controller || null,
      cnc_controller_service: formData.cnc_controller_service || null,
      remarks: formData.remarks || null,
      calibration_date: formData.calibration_date ? new Date(formData.calibration_date).toISOString() : null,
      calibration_due_date: formData.calibration_due_date ? new Date(formData.calibration_due_date).toISOString() : null,
    };

    // Debug logging
    console.log("Submitting machine data:", submitData);
    const url = machine 
      ? `${API_BASE_URL}/machines/${machine.id}`
      : `${API_BASE_URL}/machines/`;
    const method = machine ? "PUT" : "POST";
    console.log("URL:", url);
    console.log("Method:", method);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(submitData),
      });

      if (response.ok) {
        onSave();
      } else {
        const errorData = await response.json();
        console.error("Failed to save machine:", errorData);
        
        // Show specific error message if available
        if (errorData.detail) {
          if (Array.isArray(errorData.detail)) {
            const errorMessages = errorData.detail.map(err => {
              if (err.loc && err.msg) {
                return `${err.loc.join('.')}: ${err.msg}`;
              } else if (typeof err === 'string') {
                return err;
              }
              return JSON.stringify(err);
            }).join('\n');
            alert(`Failed to save machine:\n${errorMessages}`);
          } else if (typeof errorData.detail === 'string') {
            alert(`Failed to save machine: ${errorData.detail}`);
          } else {
            alert("Failed to save machine. Please check console for details.");
          }
        } else if (typeof errorData === 'object' && errorData !== null) {
          // Handle validation errors that are not in 'detail' field
          const errorMessages = Object.entries(errorData)
            .map(([field, errors]) => `${field}: ${Array.isArray(errors) ? errors.join(', ') : errors}`)
            .join('\n');
          alert(`Validation errors:\n${errorMessages}`);
        } else {
          alert("Failed to save machine. Please check your input and try again.");
        }
      }
    } catch (error) {
      console.error("Error saving machine:", error);
      alert("Error saving machine. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl">
        <h2 className="text-2xl font-bold mb-6">
          {machine ? "Edit Machine" : "Add Machine"}
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type *
              </label>
              <input
                type="text"
                name="type"
                value={formData.type}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter machine type"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Make *
              </label>
              <input
                type="text"
                name="make"
                value={formData.make}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter make"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Model *
              </label>
              <input
                type="text"
                name="model"
                value={formData.model}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter model"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Year of Installation
              </label>
              <input
                type="number"
                name="year_of_installation"
                value={formData.year_of_installation}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 2020"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                CNC Controller
              </label>
              <input
                type="text"
                name="cnc_controller"
                value={formData.cnc_controller}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter CNC controller"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                CNC Controller Service
              </label>
              <input
                type="text"
                name="cnc_controller_service"
                value={formData.cnc_controller_service}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter service provider"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Calibration Date
              </label>
              <input
                type="date"
                name="calibration_date"
                value={formData.calibration_date}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Calibration Due Date
              </label>
              <input
                type="date"
                name="calibration_due_date"
                value={formData.calibration_due_date}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Remarks
            </label>
            <textarea
              name="remarks"
              value={formData.remarks}
              onChange={handleChange}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter any additional remarks"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {loading ? "Saving..." : (machine ? "Update" : "Create")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MachineModal;