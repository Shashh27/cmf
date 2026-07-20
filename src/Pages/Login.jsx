import React, { useState } from 'react';
import { Form, Input, Button, Card, Select, Typography, message } from 'antd';
import { useLocation } from 'react-router-dom';
import { UserOutlined, LockOutlined, DesktopOutlined, TeamOutlined,CheckCircleOutlined } from '@ant-design/icons';
import logo from '../assets/cmtis.png';
import loginBg from '../assets/bg.jpg';
import { API_BASE_URL } from '../Config/auth.js';
import { useAuth } from '../auth/AuthContext.jsx';


const { Title, Text } = Typography;
const { Option } = Select;

const Login = () => {
  const [activeRole, setActiveRole] = useState(null);
  const [operatorStep, setOperatorStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [machines, setMachines] = useState([]);
  const location = useLocation();
  const { login } = useAuth();

  const [machineForm] = Form.useForm();
  const [operatorForm] = Form.useForm();
  const [adminForm] = Form.useForm();
  const [coordinatorForm] = Form.useForm();
  const [mcForm] = Form.useForm();
  const [supervisorForm] = Form.useForm();
  const [invSupervisorForm] = Form.useForm();

  // Fetch machines when operator role is selected
  React.useEffect(() => {
    if (activeRole === 'operator') {
      fetchMachines();
    }
  }, [activeRole]);

  const fetchMachines = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/machines/`, {
        headers: { accept: 'application/json' },
      });
      if (response.ok) {
        const data = await response.json();
        setMachines(data);
      } else {
        message.error('Failed to fetch machines');
      }
    } catch (error) {
      console.error('Error fetching machines:', error);
      message.error('Error connecting to server');
    }
  };

  const handleRoleSelect = (role) => {
    setActiveRole(role);
    setOperatorStep(0);
    machineForm.resetFields();
    operatorForm.resetFields();
    adminForm.resetFields();
    coordinatorForm.resetFields();
    mcForm.resetFields();
    supervisorForm.resetFields();
    invSupervisorForm.resetFields();
  };

  const onMachineSubmit = async (values) => {
    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/machines/verify?machine_id=${values.machine}&password=${values.machine_password}`,
        {
          method: 'GET',
          headers: {
            'accept': 'application/json'
          }
        }
      );

      if (response.ok) {
        const machineData = await response.json();
        // Store selected machine info if needed
        localStorage.setItem('selectedMachine', JSON.stringify(machineData));
        setOperatorStep(1);
      } else {
        message.error('invalid credential');
      }
    } catch (error) {
      console.error('Machine verification error:', error);
      message.error('An error occurred during machine verification');
    } finally {
      setLoading(false);
    }
  };

  const onLogin = async (values, role) => {
    setLoading(true);
    
    try {
      // Determine user_name based on role and form values
      let userName = values.username;
      if (role === 'Operator') {
        userName = values.operator_id;
      }

      const data = await login(userName, values.password);
      const toKey = (s) => {
        const n = String(s || '').toLowerCase().replace(/_/g, ' ').trim();
        if (n === 'admin') return 'admin';
        if (n.includes('project coordinator') || n === 'coordinator' || n === 'pc') return 'project_coordinator';
        if (n.includes('manufacturing coordinator') || n === 'mc') return 'manufacturing_coordinator';
        if (n.includes('inventory supervisor')) return 'inventory_supervisor';
        if (n.includes('supervisor')) return 'supervisor';
        if (n.includes('operator')) return 'operator';
        return n.replace(/\s+/g, '_');
      };
      const selected = toKey(role);
      const actual = toKey(data.user?.role);
      const homes = {
        admin: '/admin/dashboard',
        project_coordinator: '/project_coordinator/oms/orders',
        manufacturing_coordinator: '/manufacturing_coordinator/dashboard',
        inventory_supervisor: '/inventory_supervisor/inventory-management/inventory-master',
        supervisor: '/supervisor/production_logs',
        operator: '/operator/dashboard',
      };
      const home = homes[actual] || '/login';

      if (selected !== actual) {
        message.warning(
          `Logged in as ${data.user?.role || actual}. Opening that portal (you selected ${role}).`
        );
      } else {
        message.success('Login Successful');
      }

      const fromState = location.state?.from;
      const from = fromState ? fromState.pathname + fromState.search : null;
      const rolePrefix = home.split('/').slice(0, 2).join('/') || '';
      if (from && rolePrefix && from.startsWith(rolePrefix)) {
        window.location.assign(from);
        return;
      }
      // Full navigation so ProtectedRoute always sees localStorage user
      window.location.assign(home);
    } catch (error) {
      console.error('Login error:', error);
      message.error('invalid credential');
    } finally {
      setLoading(false);
    }
  };

  const roleOptions = [
    { value: 'admin', label: 'Admin' },
    { value: 'supervisor', label: 'Supervisor' },
    { value: 'inventory_supervisor', label: 'Supervisor-Tool Crib' },
    { value: 'coordinator', label: 'Project Coordinator' },
    { value: 'manufacturing_coordinator', label: 'Manufacturing Coordinator' },
    { value: 'operator', label: 'Operator' },
  ];

  return (
          <div
        style={{
          position: 'relative',
          minHeight: '100vh',
          backgroundImage: `url(${loginBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {/* Blur Overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backdropFilter: 'blur(4px)', // adjust blur here
            backgroundColor: 'rgba(0,0,0,0.2)', // optional dim effect
            zIndex: 0,
          }}
        />

        {/* Content */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
          }}
        >
      <Card 
        bordered={false}
        bodyStyle={{ padding: 0 }}
        style={{ 
          width: 500, 
          borderRadius: '12px', 
          overflow: 'hidden',
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
        }}
      >
        {/* Header Section */}
        <div style={{ 
          background: '#e6f4ff', 
          padding: '16px 20px', 
          textAlign: 'center',
          borderBottom: '1px solid #e6e6e6'
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            gap: '16px',
            marginBottom: '8px'
          }}>
             {/* Only cmtis.png is used */}
            <img src={logo} alt="CMTI" style={{ height: '45px', objectFit: 'contain' }} />
          </div>
          <Title level={5} style={{ margin: 0, color: '#1e293b' }}>
            Manufacturing Execution System
          </Title>
        </div>

        {/* Body Section */}
        <div style={{ padding: '20px 30px', background: '#f8fafc', minHeight: 'auto' }}>
          
          <style>{`
            .role-select-btn:hover {
              transform: translateY(-2px);
              box-shadow: 0 6px 16px rgba(0,0,0,0.12);
            }
            .role-select-btn:active {
              transform: translateY(0);
              box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            }
            .hover-blue-btn:hover {
              filter: brightness(1.06);
              box-shadow: 0 6px 16px rgba(0,0,0,0.15) !important;
              transform: translateY(-1px);
            }
          `}</style>
          
          <div style={{ display:'flex', justifyContent:'center', marginBottom:'24px' }}>
            <Select
              placeholder="Select Your Role"
              value={activeRole}
              onChange={handleRoleSelect}
              size="large"
              style={{ width: 360 }}
              showSearch
              filterOption={(input, option) =>
                option.children.toLowerCase().includes(input.toLowerCase())
              }
              prefix={<UserOutlined style={{ color: '#000000', opacity: 0.65 }} />}
            >
              {roleOptions.map(opt => (
                <Option key={opt.value} value={opt.value}>{opt.label}</Option>
              ))}
            </Select>
          </div>

          {/* Login Forms Area */}
          <div style={{ transition: 'all 0.3s' }}>
            
            {/* Operator Login Form */}
            {activeRole === 'operator' && (
              <div>
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <DesktopOutlined style={{ color: '#1890ff', fontSize: '20px' }} />
                      <Text strong>Machine Select & Verify</Text>
                    </div>
                    {operatorStep > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#52c41a' }}>
                        <CheckCircleOutlined />
                        <Text type="success" style={{ fontSize: '12px' }}>Verified</Text>
                      </div>
                    )}
                  </div>
                  
                  {operatorStep === 0 ? (
                    <Form form={machineForm} layout="vertical" onFinish={onMachineSubmit} autoComplete="off">
                      <Form.Item name="machine" rules={[{ required: true, message: 'Select a machine' }]}>
                        <Select placeholder="Select or search machine..." 
                                size="large"
                                showSearch
                                filterOption={(input, option) =>
                                  option.children.toLowerCase().includes(input.toLowerCase())
                                }
                        >
                        {machines.map(machine => (
                          <Option key={machine.id} value={machine.id}>
                            {`${machine.type} - ${machine.make} ${machine.model}`}
                          </Option>
                        ))}
                      </Select>
                      </Form.Item>
                      <Form.Item name="machine_password" rules={[{ required: true, message: 'Enter machine password' }]}>
                        <Input.Password 
                          prefix={<LockOutlined style={{ color: '#bfbfbf' }} />} 
                          placeholder="Machine Password" 
                          size="large" 
                          autoComplete="new-password"
                        />
                      </Form.Item>
                      <Button type="primary" htmlType="submit" block size="large" loading={loading} className="hover-blue-btn">
                        Next
                      </Button>
                    </Form>
                  ) : (
                    <Form form={operatorForm} layout="vertical" onFinish={(v) => onLogin(v, 'Operator')} autoComplete="off">
                      <Form.Item name="operator_id" rules={[{ required: true, message: 'Enter Operator ID' }]}>
                        <Input 
                          prefix={<UserOutlined style={{ color: '#bfbfbf' }} />} 
                          placeholder="Operator Name" 
                          size="large" 
                          autoComplete="off"
                        />
                      </Form.Item>
                      <Form.Item name="password" rules={[{ required: true, message: 'Enter password' }]}>
                        <Input.Password 
                          prefix={<LockOutlined style={{ color: '#bfbfbf' }} />} 
                          placeholder="Password" 
                          size="large" 
                          autoComplete="new-password"
                        />
                      </Form.Item>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <Button onClick={() => setOperatorStep(0)} size="large" style={{ flex: 1 }}>
                          Back
                        </Button>
                        <Button type="primary" htmlType="submit" size="large" loading={loading} style={{ flex: 1 }} className="hover-blue-btn">
                          Login
                        </Button>
                      </div>
                    </Form>
                  )}
                </div>
              </div>
            )}

            {/* Project Coordinator Login Form */}
            {activeRole === 'coordinator' && (
              <Form form={coordinatorForm} layout="vertical" onFinish={(v) => onLogin(v, 'Project Coordinator')} autoComplete="off">
                <Text strong style={{ display: 'block', marginBottom: '16px' }}>Project Coordinator Credentials</Text>
                <Form.Item name="username" rules={[{ required: true, message: 'Enter username' }]}>
                  <Input 
                    prefix={<UserOutlined style={{ color: '#bfbfbf' }} />} 
                    placeholder="Enter your name" 
                    size="large" 
                    autoComplete="off"
                  />
                </Form.Item>
                <Form.Item name="password" rules={[{ required: true, message: 'Enter password' }]}>
                  <Input.Password 
                    prefix={<LockOutlined style={{ color: '#bfbfbf' }} />} 
                    placeholder="Enter your password" 
                    size="large" 
                    autoComplete="new-password"
                  />
                </Form.Item>
                <Button type="primary" htmlType="submit" block size="large" loading={loading} className="hover-blue-btn">
                  Next
                </Button>
              </Form>
            )}

            {/* Manufacturing Coordinator Login Form */}
            {activeRole === 'manufacturing_coordinator' && (
              <Form form={mcForm} layout="vertical" onFinish={(v) => onLogin(v, 'Manufacturing Coordinator')} autoComplete="off">
                <Text strong style={{ display: 'block', marginBottom: '16px' }}>Manufacturing Coordinator Credentials</Text>
                <Form.Item name="username" rules={[{ required: true, message: 'Enter username' }]}>
                  <Input 
                    prefix={<UserOutlined style={{ color: '#bfbfbf' }} />} 
                    placeholder="Enter your name" 
                    size="large" 
                    autoComplete="off"
                  />
                </Form.Item>
                <Form.Item name="password" rules={[{ required: true, message: 'Enter password' }]}>
                  <Input.Password 
                    prefix={<LockOutlined style={{ color: '#bfbfbf' }} />} 
                    placeholder="Enter your password" 
                    size="large" 
                    autoComplete="new-password"
                  />
                </Form.Item>
                <Button type="primary" htmlType="submit" block size="large" loading={loading} className="hover-blue-btn">
                  Next
                </Button>
              </Form>
            )}

            {/* Supervisor Login Form */}
            {activeRole === 'supervisor' && (
              <Form form={supervisorForm} layout="vertical" onFinish={(v) => onLogin(v, 'Supervisor')} autoComplete="off">
                <Text strong style={{ display: 'block', marginBottom: '16px' }}>Supervisor Credentials</Text>
                <Form.Item name="username" rules={[{ required: true, message: 'Enter username' }]}>
                  <Input 
                    prefix={<UserOutlined style={{ color: '#bfbfbf' }} />} 
                    placeholder="Enter your name" 
                    size="large" 
                    autoComplete="off"
                  />
                </Form.Item>
                <Form.Item name="password" rules={[{ required: true, message: 'Enter password' }]}>
                  <Input.Password 
                    prefix={<LockOutlined style={{ color: '#bfbfbf' }} />} 
                    placeholder="Enter your password" 
                    size="large" 
                    autoComplete="new-password"
                  />
                </Form.Item>
                <Button type="primary" htmlType="submit" block size="large" loading={loading} className="hover-blue-btn">
                  Next
                </Button>
              </Form>
            )}

            {/* Inventory Supervisor Login Form */}
            {activeRole === 'inventory_supervisor' && (
              <Form form={invSupervisorForm} layout="vertical" onFinish={(v) => onLogin(v, 'Inventory Supervisor')} autoComplete="off">
                <Text strong style={{ display: 'block', marginBottom: '16px' }}>Supervisor-Tool Crib Credentials</Text>
                <Form.Item name="username" rules={[{ required: true, message: 'Enter username' }]}>
                  <Input 
                    prefix={<UserOutlined style={{ color: '#bfbfbf' }} />} 
                    placeholder="Enter your name" 
                    size="large" 
                    autoComplete="off"
                  />
                </Form.Item>
                <Form.Item name="password" rules={[{ required: true, message: 'Enter password' }]}>
                  <Input.Password 
                    prefix={<LockOutlined style={{ color: '#bfbfbf' }} />} 
                    placeholder="Enter your password" 
                    size="large" 
                    autoComplete="new-password"
                  />
                </Form.Item>
                <Button type="primary" htmlType="submit" block size="large" loading={loading} className="hover-blue-btn">
                  Next
                </Button>
              </Form>
            )}

            {/* Admin Login Form */}
            {activeRole === 'admin' && (
              <Form form={adminForm} layout="vertical" onFinish={(v) => onLogin(v, 'Admin')} autoComplete="off">
                <Text strong style={{ display: 'block', marginBottom: '16px' }}>Admin Credentials</Text>
                <Form.Item name="username" rules={[{ required: true, message: 'Enter username' }]}>
                  <Input 
                    prefix={<UserOutlined style={{ color: '#bfbfbf' }} />} 
                    placeholder="Enter your name" 
                    size="large" 
                    autoComplete="off"
                  />
                </Form.Item>
                <Form.Item name="password" rules={[{ required: true, message: 'Enter password' }]}>
                  <Input.Password 
                    prefix={<LockOutlined style={{ color: '#bfbfbf' }} />} 
                    placeholder="Enter your password" 
                    size="large" 
                    autoComplete="new-password"
                  />
                </Form.Item>
                <Button type="primary" htmlType="submit" block size="large" loading={loading} className="hover-blue-btn">
                  Next
                </Button>
              </Form>
            )}
          </div>
          
          <div style={{ textAlign: 'center', marginTop: '40px' }}>
            <Text type="secondary" style={{ fontSize: '12px', color: '#94a3b8' }}>
              © Developed and maintained by CMTI {new Date().getFullYear()}
            </Text>
          </div>
        </div>
      </Card>
    </div>
    </div>
  );
};

export default Login;
