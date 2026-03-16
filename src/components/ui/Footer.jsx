import React from 'react';
import { Layout, Typography, Grid } from 'antd';

const { Footer } = Layout;
const { Text } = Typography;
const { useBreakpoint } = Grid;

const AppFooter = ({ collapsed }) => {
  const screens = useBreakpoint();
  
  return (
    <Footer 
      style={{ 
        textAlign: 'center', 
        background: '#fff', 
        borderTop: '1px solid #f0f0f0',
        padding: '12px 24px',
        color: 'rgba(0, 0, 0, 0.65)',
        fontSize: 'clamp(11px, 2.2vw, 13px)',
        position: 'fixed',
        bottom: 0,
        zIndex: 1000,
        transition: 'all 0.2s',
        left: screens.md ? (collapsed ? 80 : 224) : 0,
        width: screens.md ? `calc(100% - ${(collapsed ? 80 : 224)}px)` : '100%',
      }}
    >
      <Text type="secondary" style={{ display: 'block' }}>
        © CMTI All rights reserved.
      </Text>
    </Footer>
  );
};

export default AppFooter;
