import React from 'react';
import { useNavigate } from 'react-router-dom';
import ShopFloorDashboard from '../shopfloordashboard/ShopFloorDashboard';

const MCShopFloorDashboard = () => {
  const navigate = useNavigate();

  return (
    <ShopFloorDashboard onBack={() => navigate(-1)} />
  );
};

export default MCShopFloorDashboard;
