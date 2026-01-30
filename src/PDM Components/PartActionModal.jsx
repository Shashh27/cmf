import React, { useState, useEffect } from "react";
import { X, Upload } from "lucide-react";
import { API_BASE_URL } from "../Config/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

const PartActionModal = ({ 
  show, 
  onHide, 
  actionType, 
  selectedPart,
  onActionCreated 
}) => {
  const [formData, setFormData] = useState({
    // Operation fields
    operation_number: '',
    operation_name: '',
    setup_time: '',
    cycle_time: '',
    workcenter_id: '',
    
    // Document fields
    document_name: '',
    document_type: '',
    document_version: '1.0',
    file: null,
    
    // Process Plan fields
    operation_id: '',
    work_instructions: '',
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [operations, setOperations] = useState([]);

  // Fetch operations for process plan dropdown
  useEffect(() => {
    if (show && actionType === 'process_plan' && selectedPart) {
      fetchOperationsForPart();
    }
  }, [show, actionType, selectedPart]);

  const fetchOperationsForPart = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/operations/part/${selectedPart.id}/`);
      if (response.ok) {
        const data = await response.json();
        setOperations(data);
      }
    } catch (error) {
      console.error("Error fetching operations:", error);
    }
  };

  // Update form data when selectedPart changes
  useEffect(() => {
    if (selectedPart) {
      setFormData(prev => ({
        ...prev,
        part_id: selectedPart.id
      }));
    }
  }, [selectedPart]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      let url, method, payload;

      if (actionType === 'operation') {
        // Create new operation
        url = `${API_BASE_URL}/operations/`;
        method = 'POST';
        payload = {
          operation_number: formData.operation_number,
          operation_name: formData.operation_name,
          setup_time: formData.setup_time || null,
          cycle_time: formData.cycle_time || null,
          workcenter_id: formData.workcenter_id ? parseInt(formData.workcenter_id) : null,
          part_id: selectedPart.id
        };
      } else if (actionType === 'document') {
        // Create new document (requires file upload)
        if (!formData.file) {
          alert('Please select a file to upload');
          setLoading(false);
          return;
        }

        const formDataObj = new FormData();
        formDataObj.append('file', formData.file);
        formDataObj.append('document_name', formData.document_name);
        formDataObj.append('document_type', formData.document_type);
        formDataObj.append('document_version', formData.document_version);
        formDataObj.append('part_id', selectedPart.id.toString());

        const response = await fetch(`${API_BASE_URL}/documents/`, {
          method: 'POST',
          body: formDataObj,
        });

        if (response.ok) {
          const result = await response.json();
          onActionCreated(result, 'document');
          onHide();
          resetForm();
        } else {
          console.error('Error creating document');
        }
        setLoading(false);
        return;
      } else if (actionType === 'process_plan') {
        // Create new process plan
        url = `${API_BASE_URL}/process-plans/`;
        method = 'POST';
        payload = {
          operation_id: parseInt(formData.operation_id),
          work_instructions: formData.work_instructions,
          notes: formData.notes
        };
      }

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const result = await response.json();
        onActionCreated(result, actionType);
        onHide();
        resetForm();
      } else {
        console.error('Error creating item');
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleFileChange = (e) => {
    setFormData(prev => ({
      ...prev,
      file: e.target.files[0]
    }));
  };

  const resetForm = () => {
    setFormData({
      operation_number: '',
      operation_name: '',
      setup_time: '',
      cycle_time: '',
      workcenter_id: '',
      document_name: '',
      document_type: '',
      document_version: '1.0',
      file: null,
      operation_id: '',
      work_instructions: '',
      notes: ''
    });
  };

  if (!show) return null;

  const getActionTitle = () => {
    switch (actionType) {
      case 'operation': return 'Create New Operation';
      case 'document': return 'Create New Document';
      case 'process_plan': return 'Create New Process Plan';
      default: return 'Create New Item';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg">{getActionTitle()}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onHide}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="mb-4">
              <Badge variant="secondary">
                For Part: {selectedPart?.part_number} - {selectedPart?.part_name}
              </Badge>
            </div>

            {actionType === 'operation' && (
              <>
                <div>
                  <label className="text-sm font-medium">Operation Number</label>
                  <Input
                    type="text"
                    value={formData.operation_number}
                    onChange={(e) => handleInputChange('operation_number', e.target.value)}
                    placeholder="e.g., OP-001"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Operation Name</label>
                  <Input
                    type="text"
                    value={formData.operation_name}
                    onChange={(e) => handleInputChange('operation_name', e.target.value)}
                    placeholder="e.g., Cutting Operation"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Setup Time (HH:MM:SS)</label>
                  <Input
                    type="text"
                    value={formData.setup_time}
                    onChange={(e) => handleInputChange('setup_time', e.target.value)}
                    placeholder="e.g., 00:30:00"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Cycle Time (HH:MM:SS)</label>
                  <Input
                    type="text"
                    value={formData.cycle_time}
                    onChange={(e) => handleInputChange('cycle_time', e.target.value)}
                    placeholder="e.g., 00:05:00"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Workcenter ID</label>
                  <Input
                    type="number"
                    value={formData.workcenter_id}
                    onChange={(e) => handleInputChange('workcenter_id', e.target.value)}
                    placeholder="e.g., 1"
                  />
                </div>
              </>
            )}

            {actionType === 'document' && (
              <>
                <div>
                  <label className="text-sm font-medium">Document Name</label>
                  <Input
                    type="text"
                    value={formData.document_name}
                    onChange={(e) => handleInputChange('document_name', e.target.value)}
                    placeholder="e.g., Technical Drawing"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Document Type</label>
                  <Input
                    type="text"
                    value={formData.document_type}
                    onChange={(e) => handleInputChange('document_type', e.target.value)}
                    placeholder="e.g., 2D Drawing"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Document Version</label>
                  <Input
                    type="text"
                    value={formData.document_version}
                    onChange={(e) => handleInputChange('document_version', e.target.value)}
                    placeholder="e.g., 1.0"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Upload File</label>
                  <Input
                    type="file"
                    onChange={handleFileChange}
                    accept=".pdf,.docx,.csv,.xlsx,.doc,.xls,.txt"
                    required
                  />
                </div>
              </>
            )}

            {actionType === 'process_plan' && (
              <>
                <div>
                  <label className="text-sm font-medium">Operation</label>
                  <select
                    value={formData.operation_id}
                    onChange={(e) => handleInputChange('operation_id', e.target.value)}
                    className="w-full p-2 border border-border rounded-md bg-background"
                    required
                  >
                    <option value="">Select an operation</option>
                    {operations.map(op => (
                      <option key={op.id} value={op.id}>
                        {op.operation_number} - {op.operation_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Work Instructions</label>
                  <textarea
                    value={formData.work_instructions}
                    onChange={(e) => handleInputChange('work_instructions', e.target.value)}
                    placeholder="Enter work instructions..."
                    className="w-full p-2 border border-border rounded-md bg-background min-h-[100px]"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    placeholder="Enter additional notes..."
                    className="w-full p-2 border border-border rounded-md bg-background min-h-[80px]"
                  />
                </div>
              </>
            )}

            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={onHide}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating...' : `Create ${actionType === 'process_plan' ? 'Process Plan' : actionType.charAt(0).toUpperCase() + actionType.slice(1)}`}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default PartActionModal;
