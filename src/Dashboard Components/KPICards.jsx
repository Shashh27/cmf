import React, { useState } from 'react';
import { Row, Col, Card, Statistic } from 'antd';
import { 
  ShoppingCartOutlined, 
  ProjectOutlined, 
  InboxOutlined, 
  ClockCircleOutlined
} from '@ant-design/icons';

const KPICards = ({ data }) => {
  const [selectedCard, setSelectedCard] = useState(null);

  const kpiCards = [
    {
      id: 'total-orders',
      title: 'Total Orders',
      subtitle: 'All Orders',
      value: data.totalOrders,
      icon: <ShoppingCartOutlined />,
      color: '#3b82f6',
      iconBgColor: 'bg-blue-100',
      bgGradient: 'from-blue-50 via-blue-50 to-white',
      bottomGradient: 'from-blue-400 via-blue-500 to-purple-500',
      hoverShadow: 'hover:shadow-xl hover:shadow-blue-100'
    },
    {
      id: 'in-progress',
      title: 'In Progress',
      subtitle: 'Currently Processing',
      value: data.inProgress,
      icon: <ProjectOutlined />,
      color: '#f97316',
      iconBgColor: 'bg-orange-100',
      bgGradient: 'from-orange-50 via-orange-50 to-white',
      bottomGradient: 'from-orange-400 via-orange-500 to-red-500',
      hoverShadow: 'hover:shadow-xl hover:shadow-orange-100'
    },
    {
      id: 'scheduled',
      title: 'Scheduled',
      subtitle: 'Scheduled',
      value: data.scheduled,
      icon: <ClockCircleOutlined />,
      color: '#8b5cf6',
      iconBgColor: 'bg-purple-100',
      bgGradient: 'from-purple-50 via-purple-50 to-white',
      bottomGradient: 'from-purple-400 via-purple-500 to-pink-500',
      hoverShadow: 'hover:shadow-xl hover:shadow-purple-100'
    },
    {
      id: 'completed',
      title: 'Completed',
      subtitle: 'Processed Orders',
      value: data.completed,
      icon: <InboxOutlined />,
      color: '#10b981',
      iconBgColor: 'bg-green-100',
      bgGradient: 'from-green-50 via-green-50 to-white',
      bottomGradient: 'from-green-400 via-emerald-500 to-teal-500',
      hoverShadow: 'hover:shadow-xl hover:shadow-green-100'
    }
  ];

  return (
    <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        {kpiCards.map((card, index) => (
        <Col xs={24} sm={12} lg={6} key={index}>
          <Card
            hoverable
            className={`
              relative overflow-hidden
              transition-all duration-300 ease-out
              bg-gradient-to-br ${card.bgGradient}
              border border-gray-200 rounded-2xl
              ${selectedCard === card.id ? 'ring-2 ring-offset-2 scale-[1.02]' : ''}
              hover:scale-[1.02] cursor-pointer
              ${card.hoverShadow}
            `}
            style={{
              boxShadow: selectedCard === card.id 
                ? '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' 
                : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              borderRadius: '16px'
            }}
            styles={{ body: { padding: '24px', paddingBottom: '20px' } }}
            onClick={() => setSelectedCard(selectedCard === card.id ? null : card.id)}
          >
            {/* Card Content */}
            <div className="relative z-10">
              {/* Header with title and icon */}
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1 pr-2">
                  <div className="text-lg font-bold text-gray-900 mb-1">
                    {card.title}
                  </div>
                  <div className="text-xs text-gray-500 font-medium">
                    {card.subtitle}
                  </div>
                </div>
                <div className={`
                  flex items-center justify-center
                  transition-all duration-500 ease-in-out
                  ${selectedCard === card.id ? 'scale-110 rotate-12' : 'hover:scale-110 hover:rotate-6'}
                `}>
                  <div className="text-5xl transition-all duration-300" style={{ color: card.color }}>
                    {card.icon}
                  </div>
                </div>
              </div>
              
              {/* Value */}
              <div className="mb-2">
                <Statistic
                  value={card.value}
                  styles={{
                    content: {
                      color: card.color,
                      fontSize: '36px',
                      fontWeight: '700',
                      lineHeight: 1.2,
                      fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
                    }
                  }}
                />
              </div>
            </div>

            {/* Bottom Gradient Border */}
            <div 
              className={`
                absolute bottom-0 left-0 right-0 h-1
                bg-gradient-to-r ${card.bottomGradient}
                transition-all duration-300
                ${selectedCard === card.id ? 'h-1.5' : ''}
              `}
              style={{
                borderBottomLeftRadius: '16px',
                borderBottomRightRadius: '16px'
              }}
            />
          </Card>
        </Col>
      ))}
    </Row>
  );
};

export default KPICards;