import React, { useState } from 'react';
import { Form, Input, Button, Card, Select, Typography, message } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserOutlined, LockOutlined, DesktopOutlined, TeamOutlined,CheckCircleOutlined } from '@ant-design/icons';
import logo from '../assets/cmtis.png';
import loginBg from '../assets/bg.jpg';
import config from '../Config/config';

const { Title, Text } = Typography;
const { Option } = Select;

const Login = () => {
  const [activeRole, setActiveRole] = useState(null);
  const [operatorStep, setOperatorStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [machines, setMachines] = useState([]);
  const navigate = useNavigate();
  const location = useLocation();

  const [machineForm] = Form.useForm();
  const [operatorForm] = Form.useForm();
  const [adminForm] = Form.useForm();
  const [coordinatorForm] = Form.useForm();

  // Fetch machines when operator role is selected
  React.useEffect(() => {
    if (activeRole === 'operator') {
      fetchMachines();
    }
  }, [activeRole]);

  const fetchMachines = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/machines/`);
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
  };

  const onMachineSubmit = async (values) => {
    setLoading(true);
    try {
      const response = await fetch(
        `${config.API_BASE_URL}/machines/verify?machine_id=${values.machine}&password=${values.machine_password}`,
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

      const response = await fetch(`${config.API_BASE_URL}/login/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'accept': 'application/json'
        },
        body: JSON.stringify({
          user_name: userName,
          password: values.password
        })
      });

      if (response.ok) {
        const data = await response.json();
        // Assuming data contains user info or token.
        // For now, we rely on the activeRole to decide navigation as per requirement.
        
        message.success('Login Successful');
        
        // Store authentication state in localStorage
        localStorage.setItem('isAuthenticated', 'true');

        // Store all response data in localStorage under 'user' key
        if (data) {
          localStorage.setItem('user', JSON.stringify(data));
        }

        // Check if there's a saved location to redirect back to
        const fromState = location.state?.from;
        const from = fromState ? fromState.pathname + fromState.search : null;

        // Validate if the 'from' path is allowed for this role
        let allowedRedirect = false;
        if (from) {
           if (role === 'Admin' && from.startsWith('/admin')) allowedRedirect = true;
           if (role === 'Project Coordinator' && from.startsWith('/project_coordinator')) allowedRedirect = true;
           if (role === 'Operator' && from.startsWith('/operator')) allowedRedirect = true;
        }

        if (allowedRedirect) {
          navigate(from, { replace: true });
        } else {
          if (role === 'Admin') {
             navigate('/admin/dashboard');
          } else if (role === 'Project Coordinator') {
             navigate('/project_coordinator/dashboard');
          } else if (role === 'Operator') {
             navigate('/operator/dashboard');
          }
        }
      } else {
        message.error('invalid credential');
      }
    } catch (error) {
      console.error('Login error:', error);
      message.error('An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  // Custom Button Component for Role Selection
  const RoleButton = ({ role, label, icon, isActive, onClick }) => (
    <div
      onClick={() => onClick(role)}
      style={{
        cursor: 'pointer',
        background: isActive ? '#1890ff' : '#fff',
        border: isActive ? '1px solid #1890ff' : '1px solid #d9d9d9',
        borderRadius: '8px',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        color: isActive ? '#fff' : 'rgba(0, 0, 0, 0.85)',
        fontWeight: 500,
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
        transition: 'all 0.3s',
        width: '100%',
        maxWidth: '240px',
        whiteSpace: 'nowrap'
      }}
    >
      {icon}
      <span>{label}</span>
    </div>
  );

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
          
          {/* Role Selection Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
              <RoleButton 
                role="operator" 
                label="Operator Login" 
                icon={<DesktopOutlined style={{ fontSize: '18px' }}/>}
                isActive={activeRole === 'operator'}
                onClick={handleRoleSelect}
              />
              <RoleButton 
                role="coordinator" 
                label="Project Coordinator Login"
                icon={<TeamOutlined style={{ fontSize: '18px' }}/>}
                isActive={activeRole === 'coordinator'}
                onClick={handleRoleSelect}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <RoleButton 
                role="admin" 
                label="Admin Login" 
                icon={<UserOutlined style={{ fontSize: '18px' }}/>}
                isActive={activeRole === 'admin'}
                onClick={handleRoleSelect}
              />
            </div>
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
                    <Form form={machineForm} layout="vertical" onFinish={onMachineSubmit}>
                      <Form.Item name="machine" rules={[{ required: true, message: 'Select a machine' }]}>
                        <Select placeholder="Select Machine" size="large">
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
                        />
                      </Form.Item>
                      <Button type="primary" htmlType="submit" block size="large" loading={loading}>
                        Next
                      </Button>
                    </Form>
                  ) : (
                    <Form form={operatorForm} layout="vertical" onFinish={(v) => onLogin(v, 'Operator')}>
                      <Form.Item name="operator_id" rules={[{ required: true, message: 'Enter Operator ID' }]}>
                        <Input 
                          prefix={<UserOutlined style={{ color: '#bfbfbf' }} />} 
                          placeholder="Operator Name" 
                          size="large" 
                        />
                      </Form.Item>
                      <Form.Item name="password" rules={[{ required: true, message: 'Enter password' }]}>
                        <Input.Password 
                          prefix={<LockOutlined style={{ color: '#bfbfbf' }} />} 
                          placeholder="Password" 
                          size="large" 
                        />
                      </Form.Item>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <Button onClick={() => setOperatorStep(0)} size="large" style={{ flex: 1 }}>
                          Back
                        </Button>
                        <Button type="primary" htmlType="submit" size="large" loading={loading} style={{ flex: 1 }}>
                          Login
                        </Button>
                      </div>
                    </Form>
                  )}
                </div>
              </div>
            )}

            {/* Project Coordinator (Supervisor) Login Form */}
            {activeRole === 'coordinator' && (
              <Form form={coordinatorForm} layout="vertical" onFinish={(v) => onLogin(v, 'Project Coordinator')}>
                <Text strong style={{ display: 'block', marginBottom: '16px' }}>Project Coordinator Credentials</Text>
                <Form.Item name="username" rules={[{ required: true, message: 'Enter username' }]}>
                  <Input 
                    prefix={<UserOutlined style={{ color: '#bfbfbf' }} />} 
                    placeholder="Enter your name" 
                    size="large" 
                  />
                </Form.Item>
                <Form.Item name="password" rules={[{ required: true, message: 'Enter password' }]}>
                  <Input.Password 
                    prefix={<LockOutlined style={{ color: '#bfbfbf' }} />} 
                    placeholder="Enter your password" 
                    size="large" 
                  />
                </Form.Item>
                <Button type="primary" htmlType="submit" block size="large" loading={loading}>
                  Next
                </Button>
              </Form>
            )}

            {/* Admin Login Form */}
            {activeRole === 'admin' && (
              <Form form={adminForm} layout="vertical" onFinish={(v) => onLogin(v, 'Admin')}>
                <Text strong style={{ display: 'block', marginBottom: '16px' }}>Admin Credentials</Text>
                <Form.Item name="username" rules={[{ required: true, message: 'Enter username' }]}>
                  <Input 
                    prefix={<UserOutlined style={{ color: '#bfbfbf' }} />} 
                    placeholder="Enter your name" 
                    size="large" 
                  />
                </Form.Item>
                <Form.Item name="password" rules={[{ required: true, message: 'Enter password' }]}>
                  <Input.Password 
                    prefix={<LockOutlined style={{ color: '#bfbfbf' }} />} 
                    placeholder="Enter your password" 
                    size="large" 
                  />
                </Form.Item>
                <Button type="primary" htmlType="submit" block size="large" loading={loading}>
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