import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, Radio, Input, Space, Spin, message, Typography, Table, Tag } from 'antd';
import { CloseOutlined, CheckOutlined } from '@ant-design/icons';
import axios from 'axios';
import { API_BASE_URL } from '../Config/auth';

const { TextArea } = Input;
const { Text } = Typography;

const OperationChecklist = ({ visible, onClose, operationId }) => {
  const [checklistData, setChecklistData] = useState([]);
  const [checklistId, setChecklistId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [responses, setResponses] = useState({});
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const cardRef = useRef(null);
  const [existingSubmission, setExistingSubmission] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [disabledChecklists, setDisabledChecklists] = useState([]);

  useEffect(() => {
    if (visible && operationId) {
      fetchChecklist();
    }
  }, [visible, operationId]);

  const fetchChecklist = async () => {
    setLoading(true);
    try {
      // Get operator ID from localStorage
      let operatorId = null;
      try {
        const userStr = localStorage.getItem('user');
        if (userStr) {
          const user = JSON.parse(userStr);
          operatorId = user.id;
        }
      } catch (e) {
        console.error('Error parsing user from local storage', e);
      }

      // Fetch checklist assignments
      const response = await axios.get(
        `${API_BASE_URL}/operation-checklists/assignments?operation_id=${operationId}`
      );
      if (response.status === 200) {
        console.log('Checklist API Response:', response.data);
        const assignments = response.data || [];
        
        // Each assignment IS a checklist item
        setChecklistData(assignments);
        
        // Check for existing submission
        if (operatorId) {
          try {
            const submissionResponse = await axios.get(
              `${API_BASE_URL}/operation-checklists/submissions/latest?operation_id=${operationId}&operator=${operatorId}`
            );
            if (submissionResponse.status === 200 && submissionResponse.data.status) {
              setExistingSubmission(submissionResponse.data);
              setDisabledChecklists(submissionResponse.data.disabled_checklists || []);

              // If rejected, allow edit mode
              if (submissionResponse.data.status === 'rejected') {
                setIsEditMode(true);

                // Populate responses from existing submission details
                const existingResponses = {};
                submissionResponse.data.details.forEach(detail => {
                  existingResponses[detail.checklist_id] = {
                    yes_no: detail.response ? 'yes' : 'no',
                    remarks: detail.op_remarks || ''
                  };
                });
                setResponses(existingResponses);
              } else if (submissionResponse.data.status === 'approved') {
                // If approved, show read-only mode with all responses
                // Need to fetch all submissions to get complete checklist history
                setIsEditMode(false);
                const allSubmissionsResponse = await axios.get(
                  `${API_BASE_URL}/operation-checklists/submissions?operation_id=${operationId}&operator=${operatorId}`
                );
                
                const existingResponses = {};
                
                // Merge all submission details to get complete response history
                if (allSubmissionsResponse.status === 200 && allSubmissionsResponse.data) {
                  const allSubmissions = allSubmissionsResponse.data || [];
                  // Process submissions in reverse order (newest first)
                  [...allSubmissions].reverse().forEach(submission => {
                    // Use checklist_names from the nested response structure
                    if (submission.checklist_names) {
                      submission.checklist_names.forEach(detail => {
                        // Only add if not already added (newest takes precedence)
                        if (!existingResponses[detail.checklist_id]) {
                          existingResponses[detail.checklist_id] = {
                            yes_no: detail.response ? 'yes' : 'no',
                            remarks: detail.op_remarks || ''
                          };
                        }
                      });
                    }
                  });
                }
                
                // For any checklists not in any submission, set to null
                assignments.forEach(assignment => {
                  if (!existingResponses[assignment.checklist_id]) {
                    existingResponses[assignment.checklist_id] = {
                      yes_no: null,
                      remarks: ''
                    };
                  }
                });
                
                setResponses(existingResponses);
                // Disable all checklists when approved
                setDisabledChecklists(assignments.map(a => a.checklist_id));
              } else {
                // If pending, disable editing
                setIsEditMode(false);
                const initialResponses = {};
                assignments.forEach(assignment => {
                  initialResponses[assignment.checklist_id] = {
                    yes_no: null,
                    remarks: ''
                  };
                });
                setResponses(initialResponses);
              }
            } else {
              // No existing submission, initialize empty responses
              setExistingSubmission(null);
              setIsEditMode(false);
              setDisabledChecklists([]);
              const initialResponses = {};
              assignments.forEach(assignment => {
                initialResponses[assignment.checklist_id] = {
                  yes_no: null,
                  remarks: ''
                };
              });
              setResponses(initialResponses);
            }
          } catch (error) {
            // No existing submission, initialize empty responses
            setExistingSubmission(null);
            setIsEditMode(false);
            setDisabledChecklists([]);
            const initialResponses = {};
            assignments.forEach(assignment => {
              initialResponses[assignment.checklist_id] = {
                yes_no: null,
                remarks: ''
              };
            });
            setResponses(initialResponses);
          }
        } else {
          // No operator ID, initialize empty responses
          setExistingSubmission(null);
          setIsEditMode(false);
          setDisabledChecklists([]);
          const initialResponses = {};
          assignments.forEach(assignment => {
            initialResponses[assignment.checklist_id] = {
              yes_no: null,
              remarks: ''
            };
          });
          setResponses(initialResponses);
        }
      }
    } catch (error) {
      console.error('Failed to fetch checklist:', error);
      message.error('Failed to fetch checklist data');
    } finally {
      setLoading(false);
    }
  };

  const handleResponseChange = (checklistId, field, value) => {
    setResponses(prev => ({
      ...prev,
      [checklistId]: {
        ...prev[checklistId],
        [field]: value
      }
    }));
  };

  const handleSubmit = async () => {
    // Validate all checklist items are answered
    const unansweredItems = checklistData.filter(item => !responses[item.checklist_id]?.yes_no);
    if (unansweredItems.length > 0) {
      message.warning('Please answer all checklist items before submitting');
      return;
    }

    // Get operator ID from localStorage
    let operatorId = null;
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        operatorId = user.id;
      }
    } catch (e) {
      console.error('Error parsing user from local storage', e);
    }

    if (!operatorId) {
      message.error('Operator not found in session. Please log in again.');
      return;
    }

    setSubmitting(true);
    try {
      // Only send checklists that are not disabled (modified ones)
      const detailsToSubmit = checklistData
        .filter(item => !disabledChecklists.includes(item.checklist_id))
        .map(item => ({
          checklist_id: item.checklist_id,
          response: responses[item.checklist_id].yes_no === 'yes',
          op_remarks: responses[item.checklist_id].remarks || ''
        }));

      const payload = {
        operator: operatorId,
        operation_id: operationId,
        details: detailsToSubmit
      };

      console.log('Submission Payload:', JSON.stringify(payload, null, 2));

      const submissionsResponse = await axios.post(
        `${API_BASE_URL}/operation-checklists/submissions`,
        payload
      );

      console.log('Submissions Response:', submissionsResponse.data);
      message.success('Checklist submitted successfully');
      onClose();
    } catch (error) {
      console.error('Failed to submit checklist:', error);
      message.error('Failed to submit checklist');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMouseDown = (e) => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea')) {
      return;
    }
    setIsDragging(true);
    const rect = cardRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragOffset.x,
      y: e.clientY - dragOffset.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  if (!visible) return null;

  return (
    <div
      ref={cardRef}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 1000,
        width: '500px',
        maxHeight: '80vh',
        overflow: 'auto',
        boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
        borderRadius: '8px'
      }}
      onMouseDown={handleMouseDown}
    >
      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <Text strong>Poka-Yoke Checklist</Text>
              {existingSubmission && existingSubmission.status && (
                <Tag
                  color={
                    existingSubmission.status === 'approved' ? 'green' :
                    existingSubmission.status === 'rejected' ? 'red' : 'orange'
                  }
                  style={{ marginLeft: 8 }}
                >
                  {existingSubmission.status.toUpperCase()}
                </Tag>
              )}
            </div>
            <Button
              type="text"
              icon={<CloseOutlined />}
              onClick={onClose}
              size="small"
            />
          </div>
        }
        bordered={false}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        {existingSubmission && existingSubmission.sup_remarks && (
          <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 4 }}>
            <Text strong style={{ color: '#fa8c16' }}>Supervisor Remarks:</Text>
            <div style={{ marginTop: 4, color: '#595959' }}>{existingSubmission.sup_remarks}</div>
          </div>
        )}
        <Spin spinning={loading}>
          {checklistData.length === 0 && !loading ? (
            <Text type="secondary">No checklist items assigned for this operation</Text>
          ) : (
            <>
              <Table
                dataSource={checklistData}
                rowKey="id"
                columns={[
                  {
                    title: 'Checklist Name',
                    dataIndex: 'checklist_name',
                    key: 'checklist_name',
                    render: (text, record) => {
                      return record.checklist_name || `Checklist ${record.checklist_id}`;
                    },
                  },
                  {
                    title: 'Yes/No',
                    key: 'yes_no',
                    width: 120,
                    render: (_, record) => {
                      const isDisabled = disabledChecklists.includes(record.checklist_id);
                      return (
                        <Space size="small">
                          <Button
                            type={responses[record.checklist_id]?.yes_no === 'yes' ? 'primary' : 'default'}
                            icon={<CheckOutlined />}
                            onClick={() => handleResponseChange(record.checklist_id, 'yes_no', 'yes')}
                            disabled={isDisabled}
                            style={{
                              borderColor: responses[record.checklist_id]?.yes_no === 'yes' ? '#52c41a' : undefined,
                              color: responses[record.checklist_id]?.yes_no === 'yes' ? '#52c41a' : undefined,
                              backgroundColor: responses[record.checklist_id]?.yes_no === 'yes' ? '#f6ffed' : undefined,
                              opacity: isDisabled ? 0.5 : 1
                            }}
                          />
                          <Button
                            type={responses[record.checklist_id]?.yes_no === 'no' ? 'primary' : 'default'}
                            danger={responses[record.checklist_id]?.yes_no === 'no'}
                            icon={<CloseOutlined />}
                            onClick={() => handleResponseChange(record.checklist_id, 'yes_no', 'no')}
                            disabled={isDisabled}
                            style={{
                              borderColor: responses[record.checklist_id]?.yes_no === 'no' ? '#ff4d4f' : undefined,
                              color: responses[record.checklist_id]?.yes_no === 'no' ? '#ff4d4f' : undefined,
                              backgroundColor: responses[record.checklist_id]?.yes_no === 'no' ? '#fff1f0' : undefined,
                              opacity: isDisabled ? 0.5 : 1
                            }}
                          />
                        </Space>
                      );
                    },
                  },
                  {
                    title: 'Remarks',
                    key: 'remarks',
                    render: (_, record) => {
                      const isDisabled = disabledChecklists.includes(record.checklist_id);
                      return (
                        <TextArea
                          rows={2}
                          value={responses[record.checklist_id]?.remarks}
                          onChange={(e) => handleResponseChange(record.checklist_id, 'remarks', e.target.value)}
                          placeholder="Enter remarks (optional)"
                          disabled={isDisabled}
                          style={{ width: '100%', opacity: isDisabled ? 0.5 : 1 }}
                        />
                      );
                    },
                  },
                ]}
                pagination={false}
                size="small"
                scroll={{ y: 300 }}
              />
              
              <Button
                type="primary"
                icon={<CheckOutlined />}
                onClick={handleSubmit}
                loading={submitting}
                disabled={existingSubmission && existingSubmission.status && !isEditMode}
                block
                style={{ marginTop: 16 }}
              >
                {isEditMode ? 'Update Checklist' : 'Submit Checklist'}
              </Button>
            </>
          )}
        </Spin>
      </Card>
    </div>
  );
};

export default OperationChecklist;
