import React, { useState, useEffect } from "react";
import { X, Plus } from "lucide-react";
import { API_BASE_URL } from "../Config/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

const CreateProductModal = ({ 
  show, 
  onHide, 
  createType, 
  selectedProduct,
  parentAssembly,
  onProductCreated 
}) => {
  const [formData, setFormData] = useState({
    product_number: '',
    product_name: '',
    product_version: '1.0', // Default version
    assembly_number: '',
    assembly_name: '',
    part_number: '',
    part_name: '',
    type_id: 1, // Default type ID
    raw_material_id: null,
    assembly_id: parentAssembly?.id || null,
    product_id: selectedProduct?.id || ''
  });
  const [loading, setLoading] = useState(false);
  const [partTypes, setPartTypes] = useState([]);

  // Update form data when selectedProduct or parentAssembly changes
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      product_id: selectedProduct?.id || '',
      assembly_id: parentAssembly?.id || null
    }));
  }, [selectedProduct, parentAssembly]);

  // Fetch part types when component mounts
  useEffect(() => {
    fetchPartTypes();
  }, []);

  const fetchPartTypes = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/part-types/`);
      if (response.ok) {
        const data = await response.json();
        setPartTypes(data);
      }
    } catch (error) {
      console.error("Error fetching part types:", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      let url, method, payload;

      if (createType === 'product') {
        // Create new product
        url = `${API_BASE_URL}/products/`;
        method = 'POST';
        payload = {
          product_number: formData.product_number,
          product_name: formData.product_name,
          product_version: formData.product_version
        };
      } else if (createType === 'assembly') {
        // Create new assembly
        url = `${API_BASE_URL}/assemblies/`;
        method = 'POST';
        payload = {
          assembly_number: formData.assembly_number,
          assembly_name: formData.assembly_name,
          product_id: formData.product_id,
          parent_id: parentAssembly?.id || null
        };
      } else if (createType === 'part') {
        // Create new part
        url = `${API_BASE_URL}/parts/`;
        method = 'POST';
        payload = {
          part_number: formData.part_number,
          part_name: formData.part_name,
          type_id: formData.type_id,
          raw_material_id: formData.raw_material_id,
          assembly_id: parentAssembly?.id || null,
          product_id: formData.product_id
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
        onProductCreated(result, createType);
        onHide();
        // Reset form
        setFormData({
          product_number: '',
          product_name: '',
          product_version: '1.0',
          assembly_number: '',
          assembly_name: '',
          part_number: '',
          part_name: '',
          type_id: 1,
          raw_material_id: null,
          assembly_id: null,
          product_id: selectedProduct?.id || ''
        });
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

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg">
            Create New {createType === 'product' ? 'Product' : createType === 'assembly' ? 'Assembly' : 'Part'}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onHide}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {createType === 'product' && (
              <>
                <div>
                  <label className="text-sm font-medium">Product Number</label>
                  <Input
                    type="text"
                    value={formData.product_number}
                    onChange={(e) => handleInputChange('product_number', e.target.value)}
                    placeholder="e.g., PRD-001"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Product Name</label>
                  <Input
                    type="text"
                    value={formData.product_name}
                    onChange={(e) => handleInputChange('product_name', e.target.value)}
                    placeholder="e.g., Main Product"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Product Version</label>
                  <Input
                    type="text"
                    value={formData.product_version}
                    onChange={(e) => handleInputChange('product_version', e.target.value)}
                    placeholder="e.g., 1.0"
                    required
                  />
                </div>
              </>
            )}

            {createType === 'assembly' && (
              <>
                <div className="mb-4">
                  <Badge variant="secondary">
                    Creating under: {selectedProduct?.product_name || 'Selected Product'}
                  </Badge>
                </div>
                <div>
                  <label className="text-sm font-medium">Assembly Number</label>
                  <Input
                    type="text"
                    value={formData.assembly_number}
                    onChange={(e) => handleInputChange('assembly_number', e.target.value)}
                    placeholder="e.g., ASM-001"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Assembly Name</label>
                  <Input
                    type="text"
                    value={formData.assembly_name}
                    onChange={(e) => handleInputChange('assembly_name', e.target.value)}
                    placeholder="e.g., Main Assembly"
                    required
                  />
                </div>
              </>
            )}

            {createType === 'part' && (
              <>
                <div className="mb-4">
                  <Badge variant="secondary">
                    Creating under: {selectedProduct?.product_name || 'Selected Product'}
                  </Badge>
                </div>
                <div>
                  <label className="text-sm font-medium">Part Number</label>
                  <Input
                    type="text"
                    value={formData.part_number}
                    onChange={(e) => handleInputChange('part_number', e.target.value)}
                    placeholder="e.g., PRT-001"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Part Name</label>
                  <Input
                    type="text"
                    value={formData.part_name}
                    onChange={(e) => handleInputChange('part_name', e.target.value)}
                    placeholder="e.g., Component Part"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Part Type</label>
                  <select
                    value={formData.type_id}
                    onChange={(e) => handleInputChange('type_id', parseInt(e.target.value))}
                    className="w-full p-2 border border-border rounded-md bg-background"
                    required
                  >
                    <option value="">Select a part type</option>
                    {partTypes.map(type => (
                      <option key={type.id} value={type.id}>
                        {type.type_name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={onHide}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating...' : `Create ${createType === 'product' ? 'Product' : createType === 'assembly' ? 'Assembly' : 'Part'}`}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreateProductModal;
