import React, { useState, useEffect } from 'react';
import {Modal,Card,Row,Col,List,Tag,DatePicker,Select,Button,message } from 'antd';
import { HistoryOutlined,ToolOutlined,CheckCircleOutlined,MonitorOutlined,DownloadOutlined,CloseOutlined } from '@ant-design/icons';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import moment from 'moment';
import { pdf } from '@react-pdf/renderer';
import { API_BASE_URL } from '../../../Config/auth.js';

const { RangePicker } = DatePicker;
const { Option } = Select;

const ToolsHistory = ({ tool, visible, onClose }) => {
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTransactions, setHistoryTransactions] = useState([]);
  const [historyProjectFilter, setHistoryProjectFilter] = useState(null);
  const [historyPartFilter, setHistoryPartFilter] = useState(null);
  const [historyDateRange, setHistoryDateRange] = useState([]);
  const [historyView, setHistoryView] = useState('all');
  const [toolIssuesApproved, setToolIssuesApproved] = useState([]);
  const [toolIssuesPending, setToolIssuesPending] = useState([]);
  const [groupedRequests, setGroupedRequests] = useState([]);
  const [toolQuantities, setToolQuantities] = useState({
    total_qty: 0,
    available_qty: 0,
    in_use_qty: 0,
    issues_qty: 0,
    requested_qty: 0,
    returned_qty: 0
  });

  // Fetch tool history data when modal opens
  useEffect(() => {
    if (visible && tool) {
      fetchToolHistory(tool);
    }
  }, [visible, tool]);

  const fetchToolHistory = async (toolData) => {
    setHistoryLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/transaction-history/by-tool/${toolData.id}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      const transactions = Array.isArray(data?.transactions) ? data.transactions : [];
      setHistoryTransactions(transactions);
      
      // Set grouped requests from backend (all calculations done in backend)
      setGroupedRequests(data?.grouped_requests || []);
      
      // Set tool issues from the transaction history response
      setToolIssuesApproved(data?.tool_issues_approved || []);
      setToolIssuesPending(data?.tool_issues_pending || []);
      
      // Set calculated quantities from endpoint
      setToolQuantities(data?.quantities || {
        total_qty: 0,
        available_qty: 0,
        in_use_qty: 0,
        issues_qty: 0,
        requested_qty: 0,
        returned_qty: 0
      });
      
    } catch (error) {
      console.error('Failed to fetch tool history:', error);
      message.error('Failed to fetch tool history: ' + error.message);
      setHistoryTransactions([]);
      setGroupedRequests([]);
      setToolIssuesApproved([]);
      setToolIssuesPending([]);
      setToolQuantities({
        total_qty: 0,
        available_qty: 0,
        in_use_qty: 0,
        issues_qty: 0,
        requested_qty: 0,
        returned_qty: 0
      });
    } finally {
      setHistoryLoading(false);
    }
  };

  // Reset filters when modal closes
  useEffect(() => {
    if (!visible) {
      setHistoryProjectFilter(null);
      setHistoryPartFilter(null);
      setHistoryDateRange([]);
      setHistoryView('all');
    }
  }, [visible]);

  // Calculate derived values from endpoint data
  const toolTotalQty = toolQuantities.total_qty;
  const toolAvailableQty = toolQuantities.available_qty;
  const toolInUseNow = toolQuantities.in_use_qty;
  const totalApprovedIssues = toolQuantities.issues_qty;
  const totalRequestedApprovedQty = toolQuantities.requested_qty;
  const totalReturnedQty = toolQuantities.returned_qty;

  const getFilteredTransactions = () => {
    if (!Array.isArray(historyTransactions) || historyTransactions.length === 0) return [];

    let startTime = null;
    let endTime = null;
    
    if (Array.isArray(historyDateRange) && historyDateRange.length === 2) {
      const [start, end] = historyDateRange;
      if (start && end) {
        startTime = start.startOf('day').valueOf();
        endTime = end.endOf('day').valueOf();
      }
    }

    return historyTransactions.filter(transaction => {
      const inventoryRequest = transaction.inventory_request || transaction.inventory_request_details || {};
      const projectName = inventoryRequest.project_name || null;
      const partName = inventoryRequest.part_name || null;

      if (historyProjectFilter && projectName !== historyProjectFilter) {
        return false;
      }

      if (historyPartFilter && partName !== historyPartFilter) {
        return false;
      }

      if (startTime && endTime) {
        const time = inventoryRequest.created_at ? new Date(inventoryRequest.created_at).getTime() : null;
        if (!time || time < startTime || time > endTime) {
          return false;
        }
      }

      return true;
    });
  };

  const getHistoryEvents = (transactions) => {
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return {
        allEvents: [],
        requestEvents: [],
        returnEvents: [],
        inUseEvents: [],
        issuesEvents: []
      };
    }

    const requestEvents = [];
    const returnEvents = [];
    const inUseEvents = [];
    const issuesEvents = [];

    // Build issues map by request_id for quick lookup
    const issuesByRequestId = {};
    (toolIssuesApproved || []).forEach(iss => {
      if (iss.request_id) {
        if (!issuesByRequestId[iss.request_id]) {
          issuesByRequestId[iss.request_id] = 0;
        }
        issuesByRequestId[iss.request_id] += iss.tool_issue_qty || 0;
      }
    });

    transactions.forEach(transaction => {
      const inventoryRequest = transaction.inventory_request || transaction.inventory_request_details || {};
      const returns = Array.isArray(transaction.return_requests) ? transaction.return_requests : [];
      
      const returnedSum = returns.reduce((sum, rr) => sum + (rr.returned_qty || 0), 0);
      const issuedSum = issuesByRequestId[inventoryRequest.id] || 0;
      const outstanding = Math.max(0, (inventoryRequest.quantity || 0) - returnedSum - issuedSum);

      // Request event
      requestEvents.push({
        key: `request_${inventoryRequest.id}`,
        type: 'REQUEST',
        date: inventoryRequest.created_at,
        project_name: inventoryRequest.project_name || '-',
        requested_by: inventoryRequest.operator_name || '-',
        requested_qty: inventoryRequest.quantity || 0,
        returned_qty: 0,
        return_status: null,
        remarks: inventoryRequest.remarks || '',
      });

      returns.forEach(returnRequest => {
        returnEvents.push({
          key: `return_${returnRequest.id}`,
          type: 'RETURN',
          date: returnRequest.created_at,
          project_name: inventoryRequest.project_name || '-',
          requested_by: inventoryRequest.operator_name || '-',
          requested_qty: inventoryRequest.quantity || 0,
          returned_qty: returnRequest.returned_qty || 0,
          return_status: returnRequest.status || '-',
          remarks: returnRequest.remarks || inventoryRequest.remarks || '',
        });
      });

      if (outstanding > 0) {
        inUseEvents.push({
          key: `inuse_${inventoryRequest.id}`,
          type: 'IN_USE',
          date: inventoryRequest.created_at,
          project_name: inventoryRequest.project_name || '-',
          requested_by: inventoryRequest.operator_name || '-',
          requested_qty: inventoryRequest.quantity || 0,
          in_use_qty: outstanding,
          remarks: inventoryRequest.remarks || '',
        });
      }
    });

    // Issues (Approved) events for this tool
    (toolIssuesApproved || []).forEach(it => {
      // Apply project filter if set
      if (historyProjectFilter && it.sale_order_number !== historyProjectFilter) {
        return;
      }
      
      // Apply part filter if set - need to find the associated inventory request
      if (historyPartFilter && it.request_id) {
        const associatedRequest = historyTransactions.find(tx => {
          const inv = tx.inventory_request || tx.inventory_request_details || {};
          return inv.id === it.request_id;
        });
        const requestPart = associatedRequest?.inventory_request?.part_name || associatedRequest?.inventory_request_details?.part_name;
        if (requestPart !== historyPartFilter) {
          return;
        }
      }
      
      issuesEvents.push({
        key: `issue_${it.id}`,
        type: 'ISSUE',
        date: it.created_at,
        project_name: it.sale_order_number || '-',
        requested_by: it.operator_name || '-',
        requested_qty: 0,
        issue_qty: it.tool_issue_qty || 0,
        approved_by: it.inventory_supervisor_name || '-',
        remarks: it.remarks || ''
      });
    });

    const allEvents = [...requestEvents, ...returnEvents, ...issuesEvents];

    allEvents.sort((a, b) => {
      const at = a.date ? new Date(a.date).getTime() : 0;
      const bt = b.date ? new Date(b.date).getTime() : 0;
      return at - bt;
    });

    return {
      allEvents,
      requestEvents,
      returnEvents,
      inUseEvents,
      issuesEvents
    };
  };

  // Filter transactions based on filters
  const filteredTransactions = getFilteredTransactions();

  // Filter grouped requests from backend based on view filter + project/part/date filters
  const filteredGroupedRequests = groupedRequests.filter(item => {
    // Project filter
    if (historyProjectFilter && item.project_name !== historyProjectFilter) {
      return false;
    }
    // Part filter
    if (historyPartFilter && item.part_name !== historyPartFilter) {
      return false;
    }
    // Date filter
    if (Array.isArray(historyDateRange) && historyDateRange.length === 2) {
      const [start, end] = historyDateRange;
      if (start && end) {
        const itemTime = item.requested_date ? new Date(item.requested_date).getTime() : null;
        const startTime = start.startOf('day').valueOf();
        const endTime = end.endOf('day').valueOf();
        if (!itemTime || itemTime < startTime || itemTime > endTime) {
          return false;
        }
      }
    }
    // View filter
    if (historyView === 'requested') return item.status?.toLowerCase() === 'approved';
    if (historyView === 'returned') return item.returns?.length > 0;
    if (historyView === 'inUse') return item.in_use_qty > 0;
    if (historyView === 'issues') return item.issues?.length > 0;
    return true; // 'all' view
  });

  // Get project and part options for filters
  const projectOptions = Array.from(
    new Set([
      ...historyTransactions
        .map(tx => {
          const inv = tx.inventory_request || tx.inventory_request_details || {};
          return inv.project_name || null;
        })
        .filter(Boolean),
      ...toolIssuesApproved
        .map(issue => issue.sale_order_number || null)
        .filter(Boolean)
    ])
  );

  const partOptions = Array.from(
    new Set([
      ...historyTransactions
        .filter(tx => {
          const inv = tx.inventory_request || tx.inventory_request_details || {};
          return !historyProjectFilter || inv.project_name === historyProjectFilter;
        })
        .map(tx => {
          const inv = tx.inventory_request || tx.inventory_request_details || {};
          return inv.part_name || null;
        })
        .filter(Boolean),
      ...toolIssuesApproved
        .filter(issue => {
          if (!historyProjectFilter) return true;
          return issue.sale_order_number === historyProjectFilter;
        })
        .map(issue => {
          const associatedRequest = historyTransactions.find(tx => {
            const inv = tx.inventory_request || tx.inventory_request_details || {};
            return inv.id === issue.request_id;
          });
          return associatedRequest?.inventory_request?.part_name || associatedRequest?.inventory_request_details?.part_name || null;
        })
        .filter(Boolean)
    ])
  );

  // Generate download rows in requested format
  const getDownloadRows = () => {
    const rows = [];
    const approvedByReqId = {};
    (toolIssuesApproved || []).forEach(it => {
      if (it.request_id) {
        approvedByReqId[it.request_id] = (approvedByReqId[it.request_id] || 0) + (it.tool_issue_qty || 0);
      }
    });

    const sorted = [...filteredGroupedRequests].sort((a, b) => {
      const at = a.requested_date ? new Date(a.requested_date).getTime() : 0;
      const bt = b.requested_date ? new Date(b.requested_date).getTime() : 0;
      return at - bt;
    });

    sorted.forEach(req => {
      const issuesRaised = Array.isArray(req.issues) ? req.issues.reduce((s, i) => s + (i.qty || 0), 0) : (req.total_issue_qty || 0) || 0;
      const issuesApproved = approvedByReqId[req.request_id] || 0;
      const returnedQty = req.total_returned_qty || 0;
      let status = '-';
      if (Array.isArray(req.returns) && req.returns.length > 0) {
        const hasCollected = req.returns.some(r => (r.status || '').toLowerCase() === 'collected');
        status = hasCollected ? 'COLLECTED' : 'PENDING';
      }
      rows.push({
        project_name: req.project_name || '-',
        part_name: req.part_name || '-',
        requested_by: req.operator_name || '-',
        requested_qty: req.requested_qty || 0,
        requested_date: req.requested_date || null,
        approved_by: req.inventory_supervisor_name || '',
        approved_date: req.approved_date || null,
        returned_qty: returnedQty,
        status,
        issues_raised_qty: issuesRaised,
        issues_approved_qty: issuesApproved,
        remarks: req.remarks || ''
      });
    });

    return rows;
  };

  // Download handlers
  const handleDownloadPDF = async () => {
    const rows = getDownloadRows();
    if (!rows.length) {
      message.warning('No data to download');
      return;
    }

    const toolName = tool?.item_description || 'Tool';
    const formatDate = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
    const Doc = () => (
      <Document>
        <Page size="A4" orientation="landscape" style={styles.page}>
          <Text style={styles.title}>{toolName} History</Text>
          <Text style={styles.summary}>Total Qty: {toolTotalQty} | Available: {toolAvailableQty} | In Use Now: {toolInUseNow} | Issues: {totalApprovedIssues}</Text>
          {historyProjectFilter ? <Text style={styles.filter}>Project: {historyProjectFilter}</Text> : null}
          {historyPartFilter ? <Text style={styles.filter}>Part: {historyPartFilter}</Text> : null}
          
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <View style={[styles.cellBox, styles.wSL]}><Text style={styles.cellHeaderText}>SL</Text></View>
              <View style={[styles.cellBox, styles.wProject]}><Text style={styles.cellHeaderText}>Project</Text></View>
              <View style={[styles.cellBox, styles.wPart]}><Text style={styles.cellHeaderText}>Part</Text></View>
              <View style={[styles.cellBox, styles.wBy]}><Text style={styles.cellHeaderText}>Requested By</Text></View>
              <View style={[styles.cellBox, styles.wQty]}><Text style={styles.cellHeaderText}>Req Qty</Text></View>
              <View style={[styles.cellBox, styles.wDate]}><Text style={styles.cellHeaderText}>Req Date</Text></View>
              <View style={[styles.cellBox, styles.wBy]}><Text style={styles.cellHeaderText}>Approved By</Text></View>
              <View style={[styles.cellBox, styles.wDate]}><Text style={styles.cellHeaderText}>Appr Date</Text></View>
              <View style={[styles.cellBox, styles.wQty]}><Text style={styles.cellHeaderText}>Ret Qty</Text></View>
              <View style={[styles.cellBox, styles.wStatus]}><Text style={styles.cellHeaderText}>Status</Text></View>
              <View style={[styles.cellBox, styles.wIssues]}><Text style={styles.cellHeaderText}>Issues Raised</Text></View>
              <View style={[styles.cellBox, styles.wIssues]}><Text style={styles.cellHeaderText}>Issues Approved</Text></View>
              <View style={[styles.cellBox, styles.wRemarks]}><Text style={styles.cellHeaderText}>Remarks</Text></View>
            </View>
            {rows.map((row, idx) => (
              <View key={idx} style={styles.tableRow}>
                <View style={[styles.cellBox, styles.wSL]}><Text style={styles.cellText}>{idx + 1}</Text></View>
                <View style={[styles.cellBox, styles.wProject]}><Text style={styles.cellText}>{row.project_name || '-'}</Text></View>
                <View style={[styles.cellBox, styles.wPart]}><Text style={styles.cellText}>{row.part_name || '-'}</Text></View>
                <View style={[styles.cellBox, styles.wBy]}><Text style={styles.cellText}>{row.requested_by || '-'}</Text></View>
                <View style={[styles.cellBox, styles.wQty]}><Text style={styles.cellText}>{String(row.requested_qty)}</Text></View>
                <View style={[styles.cellBox, styles.wDate]}><Text style={styles.cellText}>{formatDate(row.requested_date)}</Text></View>
                <View style={[styles.cellBox, styles.wBy]}><Text style={styles.cellText}>{row.approved_by || '-'}</Text></View>
                <View style={[styles.cellBox, styles.wDate]}><Text style={styles.cellText}>{formatDate(row.approved_date)}</Text></View>
                <View style={[styles.cellBox, styles.wQty]}><Text style={styles.cellText}>{String(row.returned_qty)}</Text></View>
                <View style={[styles.cellBox, styles.wStatus]}><Text style={styles.cellText}>{row.status || '-'}</Text></View>
                <View style={[styles.cellBox, styles.wIssues]}><Text style={styles.cellText}>{String(row.issues_raised_qty)}</Text></View>
                <View style={[styles.cellBox, styles.wIssues]}><Text style={styles.cellText}>{String(row.issues_approved_qty)}</Text></View>
                <View style={[styles.cellBox, styles.wRemarks]}><Text style={styles.cellText}>{row.remarks || '-'}</Text></View>
              </View>
            ))}
          </View>
        </Page>
      </Document>
    );

    const blob = await pdf(<Doc />).toBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = (tool?.item_description || 'tool_history').replace(/[^a-z0-9_-]/gi, '_');
    link.href = url;
    link.download = `${safeName}_history.pdf`;
    link.click();
    URL.revokeObjectURL(url);
    message.success('PDF downloaded successfully');
  };

  const styles = StyleSheet.create({
    page: { padding: 30, fontSize: 9, fontFamily: 'Helvetica' },
    title: { fontSize: 20, marginBottom: 10, fontWeight: 'bold' },
    summary: { fontSize: 12, marginBottom: 8, color: '#333' },
    filter: { fontSize: 10, marginBottom: 4, color: '#666' },
    table: { marginTop: 10, borderWidth: 1, borderColor: '#000', display: 'table', width: 'auto' },
    tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#000' },
    tableHeader: { backgroundColor: '#f0f0f0', borderBottomWidth: 2, borderBottomColor: '#000' },
    cellBox: { padding: 5, borderRightWidth: 1, borderRightColor: '#000', justifyContent: 'center' },
    cellHeaderText: { fontWeight: 'bold', fontSize: 10 },
    cellText: { fontSize: 9 },
    wSL: { width: '5%', textAlign: 'right' },
    wProject: { width: '10%' },
    wPart: { width: '10%' },
    wBy: { width: '12%' },
    wQty: { width: '6%', textAlign: 'right' },
    wDate: { width: '12%' },
    wStatus: { width: '10%' },
    wIssues: { width: '8%', textAlign: 'right' },
    wRemarks: { width: '15%', flexGrow: 1, borderRightWidth: 0 },
  });

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <HistoryOutlined style={{ color: '#1890ff' }} />
          <span>Tool History{tool ? ` - ${tool.item_description}` : ''}</span>
        </div>
      }
      open={visible}
      onCancel={onClose}
      maskClosable={false}
      keyboard={false}
      footer={null}
      width="90%"
      style={{ maxWidth: 1000, top: 20 }}
    >
      <div style={{ marginBottom: 20 }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12}>
            <Card
              size="small"
              style={{
                borderRadius: 12,
                background: '#f0f7ff',
                border: '1px solid #dbeafe',
                borderBottom: historyView === 'all' ? '3px solid #3b82f6' : '3px solid transparent',
                boxShadow: historyView === 'all' 
                  ? '0 4px 12px rgba(59, 130, 246, 0.15)' 
                  : '0 1px 3px rgba(0, 0, 0, 0.06)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              hoverable
              onClick={() => setHistoryView('all')}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = historyView === 'all' 
                  ? '0 4px 12px rgba(59, 130, 246, 0.15)' 
                  : '0 1px 3px rgba(0, 0, 0, 0.06)';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>
                    Total Transactions
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    All request history
                  </div>
                </div>
                <HistoryOutlined style={{ color: '#3b82f6', fontSize: 36 }} />
              </div>
              <div style={{ fontSize: 32, fontWeight: 700, color: '#3b82f6', marginTop: 16 }}>
                {groupedRequests.length}
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12}>
            <Card
              size="small"
              style={{
                borderRadius: 12,
                background: '#fff7ed',
                border: '1px solid #ffedd5',
                borderBottom: historyView === 'inUse' ? '3px solid #f97316' : '3px solid transparent',
                boxShadow: historyView === 'inUse' 
                  ? '0 4px 12px rgba(249, 115, 22, 0.15)' 
                  : '0 1px 3px rgba(0, 0, 0, 0.06)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              hoverable
              onClick={() => setHistoryView('inUse')}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(249, 115, 22, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = historyView === 'inUse' 
                  ? '0 4px 12px rgba(249, 115, 22, 0.15)' 
                  : '0 1px 3px rgba(0, 0, 0, 0.06)';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>
                    Active Usage
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    Currently in field use
                  </div>
                </div>
                <MonitorOutlined style={{ color: '#f97316', fontSize: 36 }} />
              </div>
              <div style={{ fontSize: 32, fontWeight: 700, color: '#f97316', marginTop: 16 }}>
                {toolInUseNow}
              </div>
            </Card>
          </Col>
        </Row>
      </div>

      {/* Tool Quantities Overview */}
      <div style={{ 
        marginTop: 12, 
        marginBottom: 12, 
        padding: '12px 16px', 
        background: '#f5f5f5', 
        borderRadius: 8, 
        display: 'flex', 
        flexWrap: 'wrap',
        justifyContent: 'space-between', 
        alignItems: 'center',
        gap: '8px 16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontWeight: 600 }}>Total Qty:</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#000000' }}>{toolTotalQty}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontWeight: 600 }}>Available Qty:</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#000000' }}>{toolAvailableQty}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontWeight: 600 }}>In Use Now:</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#000000' }}>{toolInUseNow}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontWeight: 600 }}>Issues (Approved):</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#000000' }}>{totalApprovedIssues}</span>
        </div>
      </div>

      <div style={{ marginTop: 12, marginBottom: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} lg={18}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <RangePicker
                onChange={(range) => setHistoryDateRange(range || [])}
                style={{ minWidth: 200, flex: 1 }}
                disabledDate={(current) => current && current > moment().endOf('day')}
                inputReadOnly
              />
              <Select
                allowClear
                placeholder="Filter by Project"
                style={{ minWidth: 180, flex: 1 }}
                value={historyProjectFilter}
                onChange={(value) => {
                  setHistoryProjectFilter(value || null);
                  setHistoryPartFilter(null);
                }}
              >
                {projectOptions.map(project => (
                  <Option key={project} value={project}>
                    {project}
                  </Option>
                ))}
              </Select>
              <Select
                allowClear
                placeholder={historyProjectFilter ? (partOptions.length === 1 ? partOptions[0] : `${partOptions.length} parts`) : "Select project first"}
                style={{ minWidth: 160, flex: 1 }}
                value={historyPartFilter}
                onChange={(value) => setHistoryPartFilter(value || null)}
                disabled={!historyProjectFilter}
                open={historyProjectFilter && partOptions.length > 0 ? undefined : false}
                showSearch
                autoFocus={historyProjectFilter && partOptions.length === 1}
              >
                {partOptions.map(part => (
                  <Option key={part} value={part}>
                    {part}
                  </Option>
                ))}
              </Select>
            </div>
          </Col>
          <Col xs={24} lg={6} style={{ textAlign: 'right' }}>
            {historyView === 'all' && (
              <Button type="primary" icon={<DownloadOutlined />} onClick={handleDownloadPDF} block>
                Download PDF
              </Button>
            )}
          </Col>
        </Row>
      </div>

      <List
        loading={historyLoading}
        dataSource={filteredGroupedRequests}
        renderItem={(request) => (
          <List.Item style={{ padding: 0, marginBottom: 16 }}>
            <Card
                hoverable
                style={{
                  width: '100%',
                  borderRadius: 12,
                  border: '2px solid #ffe58f',
                  overflow: 'hidden',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
                }}
              styles={{ body: { padding: 0 } }}
            >
              <div style={{ 
                background: '#fffbe6',
                padding: '16px 20px',
                borderBottom: '1px solid #ffe58f'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ background: '#fffbe6', border: '1px solid #ffe58f', color: '#d48806', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                    {request.project_name}
                  </span>
                  <span style={{ background: '#ffffff', border: '1px solid #d9d9d9', color: '#595959', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                    {request.part_name}
                  </span>
                  <span style={{ background: '#f5f5f5', border: '1px solid #d9d9d9', color: '#595959', padding: '2px 10px', borderRadius: 12, fontSize: 12 }}>
                    Operator: <strong>{request.operator_name}</strong>
                  </span>
                </div>
              </div>

              <div style={{ padding: '20px 24px', background: '#ffffff' }}>
                <div style={{ display: 'flex', position: 'relative', marginBottom: 16 }}>
                  <div style={{ 
                    position: 'absolute', 
                    left: 15, 
                    top: 28, 
                    bottom: -16, 
                    width: 2, 
                    background: request.approved_date ? '#52c41a' : '#d9d9d9',
                    zIndex: 0
                  }} />
                  
                  <div style={{ 
                    width: 32, 
                    height: 32, 
                    borderRadius: '50%', 
                    background: '#1890ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    zIndex: 1,
                    boxShadow: '0 2px 4px rgba(24,144,255,0.3)'
                  }}>
                    <span style={{ color: 'white', fontSize: 14, fontWeight: 700 }}>1</span>
                  </div>
                  
                  <div style={{ marginLeft: 16, flex: 1, padding: '12px 14px', background: '#e6f7ff', borderRadius: 10, borderLeft: '4px solid #1890ff', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: 15, color: '#1890ff' }}>Request Submitted</span>
                        <span style={{ marginLeft: 12, fontSize: 14, color: '#262626', fontWeight: 500 }}>
                          Qty: {request.requested_qty}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#8c8c8c', fontWeight: 500 }}>
                        {request.requested_date ? new Date(request.requested_date).toLocaleString('en-GB', {
                          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                        }) : '-'}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 6 }}>
                      Status: <Tag color={request.status?.toLowerCase() === 'approved' ? 'green' : request.status?.toLowerCase() === 'rejected' ? 'red' : 'orange'} style={{ fontSize: 11 }}>
                        {request.status?.toUpperCase()}
                      </Tag>
                    </div>
                  </div>
                </div>

                {request.approved_date && (
                  <div style={{ display: 'flex', position: 'relative', marginBottom: 16 }}>
                    {(request.returns?.length > 0 || request.issues?.length > 0 || request.in_use_qty > 0) && (
                      <div style={{ 
                        position: 'absolute', 
                        left: 15, 
                        top: 28, 
                        bottom: -16, 
                        width: 2, 
                        background: '#52c41a',
                        zIndex: 0
                      }} />
                    )}
                    
                    <div style={{ 
                      width: 32, 
                      height: 32, 
                      borderRadius: '50%', 
                      background: '#52c41a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      zIndex: 1,
                      boxShadow: '0 2px 4px rgba(82,196,26,0.3)'
                    }}>
                      <span style={{ color: 'white', fontSize: 14, fontWeight: 700 }}>2</span>
                    </div>
                    
                    <div style={{ marginLeft: 16, flex: 1, padding: '12px 14px', background: '#f6ffed', borderRadius: 10, borderLeft: '4px solid #52c41a', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontWeight: 600, fontSize: 15, color: '#52c41a' }}>Request Approved</span>
                          <span style={{ marginLeft: 12, fontSize: 14, color: '#262626', fontWeight: 500 }}>✓ Approved by Admin</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#8c8c8c', fontWeight: 500 }}>
                          {new Date(request.approved_date).toLocaleString('en-GB', {
                            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {request.returns?.length > 0 && request.returns.map((ret, idx) => (
                  <React.Fragment key={idx}>
                    <div style={{ display: 'flex', position: 'relative', marginBottom: 16 }}>
                      <div style={{ 
                        position: 'absolute', 
                        left: 15, 
                        top: 28, 
                        bottom: -16, 
                        width: 2, 
                        background: '#1890ff',
                        zIndex: 0
                      }} />
                      
                      <div style={{ 
                        width: 32, 
                        height: 32, 
                        borderRadius: '50%', 
                        background: '#1890ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        zIndex: 1,
                        boxShadow: '0 2px 4px rgba(24,144,255,0.3)'
                      }}>
                        <span style={{ color: 'white', fontSize: 12 }}>↩</span>
                      </div>
                      
                      <div style={{ marginLeft: 16, flex: 1, padding: '12px 14px', background: '#e6f7ff', borderRadius: 10, borderLeft: '4px solid #1890ff', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <span style={{ fontWeight: 600, fontSize: 15, color: '#1890ff' }}>Return Request Submitted</span>
                            <span style={{ marginLeft: 12, fontSize: 14, color: '#262626', fontWeight: 500 }}>
                              Qty: {ret.qty}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: '#8c8c8c', fontWeight: 500 }}>
                            {ret.submitted_date ? new Date(ret.submitted_date).toLocaleString('en-GB', {
                              day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                            }) : '-'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', position: 'relative', marginBottom: 16 }}>
                      {(idx < request.returns.length - 1 || request.issues?.length > 0 || request.in_use_qty > 0) && (
                        <div style={{ 
                          position: 'absolute', 
                          left: 15, 
                          top: 28, 
                          bottom: -16, 
                          width: 2, 
                          background: ret.status?.toLowerCase() === 'collected' ? '#52c41a' : '#fa8c16',
                          zIndex: 0
                        }} />
                      )}
                      
                      <div style={{ 
                        width: 32, 
                        height: 32, 
                        borderRadius: '50%', 
                        background: ret.status?.toLowerCase() === 'collected' ? '#52c41a' : '#fa8c16',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        zIndex: 1,
                        boxShadow: ret.status?.toLowerCase() === 'collected' 
                          ? '0 2px 4px rgba(82,196,26,0.3)' 
                          : '0 2px 4px rgba(250,140,22,0.3)'
                      }}>
                        <span style={{ color: 'white', fontSize: 14 }}>
                          {ret.status?.toLowerCase() === 'collected' ? '✓' : '⏳'}
                        </span>
                      </div>
                      
                      <div style={{ 
                        marginLeft: 16, 
                        flex: 1, 
                        padding: '12px 14px', 
                        background: ret.status?.toLowerCase() === 'collected' ? '#f6ffed' : '#fff7e6', 
                        borderRadius: 10, 
                        borderLeft: ret.status?.toLowerCase() === 'collected' ? '4px solid #52c41a' : '4px solid #fa8c16',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.06)' 
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <span style={{ 
                              fontWeight: 600, 
                              fontSize: 15, 
                              color: ret.status?.toLowerCase() === 'collected' ? '#52c41a' : '#fa8c16' 
                            }}>
                              {ret.status?.toLowerCase() === 'collected' ? 'Return Collected' : 'Return Pending'}
                            </span>
                            <span style={{ marginLeft: 12, fontSize: 14, color: '#262626', fontWeight: 500 }}>
                              Qty: {ret.qty}
                            </span>
                            <Tag 
                              color={ret.status?.toLowerCase() === 'collected' ? 'green' : 'orange'} 
                              style={{ marginLeft: 8, fontSize: 11 }}
                            >
                              {ret.status?.toUpperCase()}
                            </Tag>
                          </div>
                          <div style={{ fontSize: 12, color: '#8c8c8c', fontWeight: 500 }}>
                            {ret.collected_date ? new Date(ret.collected_date).toLocaleString('en-GB', {
                              day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                            }) : (ret.submitted_date ? new Date(ret.submitted_date).toLocaleString('en-GB', {
                              day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                            }) : '-')}
                          </div>
                        </div>
                        {ret.status?.toLowerCase() === 'collected' && ret.admin_name && (
                          <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 6 }}>
                            Collected by: <strong>{ret.admin_name}</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                ))}

                {request.issues?.length > 0 && request.issues.map((issue, idx) => (
                  <div key={idx} style={{ display: 'flex', position: 'relative', marginBottom: 16 }}>
                    {(idx < request.issues.length - 1 || request.in_use_qty > 0) && (
                      <div style={{ 
                        position: 'absolute', 
                        left: 15, 
                        top: 28, 
                        bottom: -16, 
                        width: 2, 
                        background: '#ff4d4f',
                        zIndex: 0
                      }} />
                    )}
                    
                    <div style={{ 
                      width: 32, 
                      height: 32, 
                      borderRadius: '50%', 
                      background: '#ff4d4f',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      zIndex: 1,
                      boxShadow: '0 2px 4px rgba(255,77,79,0.3)'
                    }}>
                      <span style={{ color: 'white', fontSize: 14 }}>⚠</span>
                    </div>
                    
                    <div style={{ marginLeft: 16, flex: 1, padding: '12px 14px', background: '#fff1f0', borderRadius: 10, borderLeft: '4px solid #ff4d4f', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontWeight: 600, fontSize: 15, color: '#ff4d4f' }}>Issue Reported</span>
                          <span style={{ marginLeft: 12, fontSize: 14, color: '#262626', fontWeight: 500 }}>
                            Qty: {issue.qty}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#8c8c8c', fontWeight: 500 }}>
                          {issue.date ? new Date(issue.date).toLocaleString('en-GB', {
                            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                          }) : '-'}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 6 }}>
                        Approved by: {issue.approved_by}
                      </div>
                    </div>
                  </div>
                ))}

                {request.in_use_qty > 0 && (
                  <div style={{ display: 'flex', position: 'relative' }}>
                    <div style={{ 
                      width: 32, 
                      height: 32, 
                      borderRadius: '50%', 
                      background: '#fa8c16',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      zIndex: 1,
                      boxShadow: '0 2px 4px rgba(250,140,22,0.3)',
                      border: '2px dashed #fff'
                    }}>
                      <span style={{ color: 'white', fontSize: 14 }}>●</span>
                    </div>
                    
                    <div style={{ marginLeft: 16, flex: 1, padding: '12px 14px', background: '#fff7e6', borderRadius: 10, borderLeft: '4px solid #fa8c16', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontWeight: 600, fontSize: 15, color: '#fa8c16' }}>Currently In Use</span>
                          <span style={{ marginLeft: 12, fontSize: 14, color: '#262626', fontWeight: 500 }}>
                            Qty: {request.in_use_qty}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#fa8c16', fontWeight: 600 }}>
                          Active
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 6 }}>
                        Awaiting return
                      </div>
                    </div>
                  </div>
                )}

                {request.status?.toLowerCase() === 'rejected' && (
                  <div style={{ display: 'flex', position: 'relative' }}>
                    <div style={{ 
                      width: 32, 
                      height: 32, 
                      borderRadius: '50%', 
                      background: '#ff4d4f',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      zIndex: 1,
                      boxShadow: '0 2px 4px rgba(255,77,79,0.3)'
                    }}>
                      <span style={{ color: 'white', fontSize: 14 }}>✕</span>
                    </div>
                    
                    <div style={{ marginLeft: 16, flex: 1, padding: '12px 14px', background: '#fff1f0', borderRadius: 10, borderLeft: '4px solid #ff4d4f', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontWeight: 600, fontSize: 14, color: '#ff4d4f' }}>Request Rejected</span>
                          <span style={{ marginLeft: 12, fontSize: 14, color: '#262626', fontWeight: 500 }}>
                            No tools issued
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ 
                background: '#ffffff', 
                padding: '12px 18px',
                borderTop: '1px solid #f0f0f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ background: '#e6f7ff', border: '1px solid #91d5ff', color: '#096dd9', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                    Requested: {request.requested_qty}
                  </span>
                  <span style={{ background: '#f6ffed', border: '1px solid #b7eb8f', color: '#237804', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                    Returned: {request.total_returned_qty}
                  </span>
                  <span style={{ background: '#fff7e6', border: '1px solid #ffd591', color: '#ad4e00', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                    In Use: {request.in_use_qty}
                  </span>
                  <span style={{ background: '#fff1f0', border: '1px solid #ffa39e', color: '#a8071a', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                    Issues: {request.total_issue_qty}
                  </span>
                </div>
                <span style={{ background: '#fffbe6', border: '1px solid #ffe58f', color: '#d48806', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                  Balance: {request.in_use_qty || 0}
                </span>
              </div>
            </Card>
          </List.Item>
        )}
      />
    </Modal>
  );
};

export default ToolsHistory;
