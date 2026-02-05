import React, { useState, useEffect } from "react";
import { X, Upload, Plus, Trash2 } from "lucide-react";
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
  const [itemsList, setItemsList] = useState([]);

  // Fetch operations for process plan dropdown
  useEffect(() => {
    if (show && actionType === 'process_plan' && selectedPart) {
      fetchOperationsForPart();
    }
    // Add one default item when modal opens
    if (show && itemsList.length === 0) {
      addNewItem();
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
      // Handle multiple items creation
      await handleMultipleItemsCreation();
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMultipleItemsCreation = async () => {
    const results = [];
    
    for (const item of itemsList) {
      try {
        if (actionType === 'operation') {
          const payload = {
            operation_number: item.operation_number,
            operation_name: item.operation_name,
            setup_time: item.setup_time || null,
            cycle_time: item.cycle_time || null,
            workcenter_id: item.workcenter_id ? parseInt(item.workcenter_id) : null,
            part_id: selectedPart.id
          };
          
          const response = await fetch(`${API_BASE_URL}/operations/`, {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          
          if (response.ok) {
            results.push(await response.json());
          }
        } else if (actionType === 'document') {
          if (!item.file) continue;
          
          const formDataObj = new FormData();
          formDataObj.append('file', item.file);
          formDataObj.append('document_name', item.document_name);
          formDataObj.append('document_type', item.document_type);
          formDataObj.append('document_version', item.document_version);
          formDataObj.append('part_id', selectedPart.id.toString());
          
          const response = await fetch(`${API_BASE_URL}/documents/`, {
            method: 'POST',
            body: formDataObj,
          });
          
          if (response.ok) {
            results.push(await response.json());
          }
        } else if (actionType === 'process_plan') {
          const payload = {
            operation_id: parseInt(item.operation_id),
            work_instructions: item.work_instructions,
            notes: item.notes
          };
          
          const response = await fetch(`${API_BASE_URL}/process-plans/`, {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          
          if (response.ok) {
            results.push(await response.json());
          }
        }
      } catch (error) {
        console.error(`Error creating item:`, error);
      }
    }
    
    if (results.length > 0) {
      onActionCreated(results[0], actionType); // Notify with first result
      onHide();
      resetForm();
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
    setItemsList([]);
  };

  const addNewItem = () => {
    const newItem = actionType === 'operation' 
      ? { operation_number: '', operation_name: '', setup_time: '', cycle_time: '', workcenter_id: '' }
      : actionType === 'document'
      ? { document_name: '', document_type: '', document_version: '1.0', file: null }
      : { operation_id: '', work_instructions: '', notes: '' };
    
    setItemsList([...itemsList, newItem]);
  };

  const updateItem = (index, field, value) => {
    const updatedItems = [...itemsList];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    setItemsList(updatedItems);
  };

  const removeItem = (index) => {
    setItemsList(itemsList.filter((_, i) => i !== index));
  };

  const getItemTemplate = () => {
    if (actionType === 'operation') {
      return { operation_number: '', operation_name: '', setup_time: '', cycle_time: '', workcenter_id: '' };
    } else if (actionType === 'document') {
      return { document_name: '', document_type: '', document_version: '1.0', file: null };
    } else {
      return { operation_id: '', work_instructions: '', notes: '' };
    }
  };

  if (!show) return null;

  const getActionTitle = () => {
    switch (actionType) {
      case 'operation': return 'Create Operations';
      case 'document': return 'Create Documents';
      case 'process_plan': return 'Create Process Plans';
      default: return 'Create Items';
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

            {/* Items list - always shows at least one item */}
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {itemsList.map((item, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">{actionType === 'operation' ? 'Operation' : actionType === 'document' ? 'Document' : 'Process Plan'} {index + 1}</h4>
                    {itemsList.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(index)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                    
                    {actionType === 'operation' && (
                      <>
                        <div>
                          <label className="text-xs font-medium">Operation Number</label>
                          <Input
                            type="text"
                            value={item.operation_number}
                            onChange={(e) => updateItem(index, 'operation_number', e.target.value)}
                            placeholder="e.g., OP-001"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium">Operation Name</label>
                          <Input
                            type="text"
                            value={item.operation_name}
                            onChange={(e) => updateItem(index, 'operation_name', e.target.value)}
                            placeholder="e.g., Cutting Operation"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium">Setup Time</label>
                          <Input
                            type="text"
                            value={item.setup_time}
                            onChange={(e) => updateItem(index, 'setup_time', e.target.value)}
                            placeholder="e.g., 00:30:00"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium">Cycle Time</label>
                          <Input
                            type="text"
                            value={item.cycle_time}
                            onChange={(e) => updateItem(index, 'cycle_time', e.target.value)}
                            placeholder="e.g., 00:05:00"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium">Workcenter ID</label>
                          <Input
                            type="number"
                            value={item.workcenter_id}
                            onChange={(e) => updateItem(index, 'workcenter_id', e.target.value)}
                            placeholder="e.g., 1"
                          />
                        </div>
                      </>
                    )}
                    
                    {actionType === 'document' && (
                      <>
                        <div>
                          <label className="text-xs font-medium">Document Name</label>
                          <Input
                            type="text"
                            value={item.document_name}
                            onChange={(e) => updateItem(index, 'document_name', e.target.value)}
                            placeholder="e.g., Technical Drawing"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium">Document Type</label>
                          <Input
                            type="text"
                            value={item.document_type}
                            onChange={(e) => updateItem(index, 'document_type', e.target.value)}
                            placeholder="e.g., 2D Drawing"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium">Document Version</label>
                          <Input
                            type="text"
                            value={item.document_version}
                            onChange={(e) => updateItem(index, 'document_version', e.target.value)}
                            placeholder="e.g., 1.0"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium">Upload File</label>
                          <Input
                            type="file"
                            onChange={(e) => updateItem(index, 'file', e.target.files[0])}
                            accept=".pdf,.docx,.csv,.xlsx,.doc,.xls,.txt"
                            required
                          />
                        </div>
                      </>
                    )}
                    
                    {actionType === 'process_plan' && (
                      <>
                        <div>
                          <label className="text-xs font-medium">Operation</label>
                          <select
                            value={item.operation_id}
                            onChange={(e) => updateItem(index, 'operation_id', e.target.value)}
                            className="w-full p-2 border border-border rounded-md bg-background text-sm"
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
                          <label className="text-xs font-medium">Work Instructions</label>
                          <textarea
                            value={item.work_instructions}
                            onChange={(e) => updateItem(index, 'work_instructions', e.target.value)}
                            placeholder="Enter work instructions..."
                            className="w-full p-2 border border-border rounded-md bg-background min-h-[80px] text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium">Notes</label>
                          <textarea
                            value={item.notes}
                            onChange={(e) => updateItem(index, 'notes', e.target.value)}
                            placeholder="Enter additional notes..."
                            className="w-full p-2 border border-border rounded-md bg-background min-h-[60px] text-sm"
                          />
                        </div>
                      </>
                    )}
                  </div>
                ))}
            </div>

            {/* Add another button at bottom */}
            <div className="flex justify-center mb-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addNewItem()}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Another {actionType === 'operation' ? 'Operation' : actionType === 'document' ? 'Document' : 'Process Plan'}
              </Button>
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={onHide}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating...' : `Create ${actionType === 'process_plan' ? 'Process Plans' : actionType.charAt(0).toUpperCase() + actionType.slice(1) + 's'}`}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default PartActionModal;
