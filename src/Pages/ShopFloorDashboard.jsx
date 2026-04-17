import React from 'react';
import { useNavigate } from 'react-router-dom';
import ShopFloorDashboard from '../shopfloordashboard/ShopFloorDashboard';

const ShopFloorDashboardPage = () => {
  const navigate = useNavigate();

  return (
    <ShopFloorDashboard onBack={() => navigate(-1)} />
  );
};

export default ShopFloorDashboardPage;