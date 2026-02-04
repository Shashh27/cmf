import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "../Config/auth.js";
import { Button } from "../components/ui/button";

const WorkCenterModal = ({ workCenter, isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    code: "",
    work_center_name: "",
    description: "",
    is_schedulable: false,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (workCenter) {
      setFormData({
        code: workCenter.code || "",
        work_center_name: workCenter.work_center_name || "",
        description: workCenter.description || "",
        is_schedulable: workCenter.is_schedulable || false,
      });
    } else {
      setFormData({
        code: "",
        work_center_name: "",
        description: "",
        is_schedulable: false,
      });
    }
  }, [workCenter]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const url = workCenter 
        ? `${API_BASE_URL}/workcenters/${workCenter.id}`
        : `${API_BASE_URL}/workcenters/`;
      
      const method = workCenter ? "PUT" : "POST";
      
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        onSave();
      } else {
        const errorData = await response.json();
        console.error("Failed to save work center:", errorData);
        alert("Failed to save work center. Please try again.");
      }
    } catch (error) {
      console.error("Error saving work center:", error);
      alert("Error saving work center. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">
          {workCenter ? "Edit Work Center" : "Add Work Center"}
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Code *
            </label>
            <input
              type="text"
              name="code"
              value={formData.code}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Work Center Name *
            </label>
            <input
              type="text"
              name="work_center_name"
              value={formData.work_center_name}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              name="is_schedulable"
              id="is_schedulable"
              checked={formData.is_schedulable}
              onChange={handleChange}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label
              htmlFor="is_schedulable"
              className="ml-2 block text-sm text-gray-900"
            >
              Is Schedulable
            </label>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
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
              className="bg-black-600 hover:bg-black-700"
            >
              {loading ? "Saving..." : (workCenter ? "Update" : "Create")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default WorkCenterModal;
