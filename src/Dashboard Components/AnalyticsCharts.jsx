import React from 'react';
import { Row, Col, Card, Space, Empty, Select } from 'antd';
import { 
  BarChartOutlined, 
  LineChartOutlined, 
  PieChartOutlined 
} from '@ant-design/icons';

const AnalyticsCharts = ({ data }) => {
  const [selectedYear, setSelectedYear] = React.useState(new Date().getFullYear());
  
  // Generate mock yearly data
  const generateYearlyData = (year) => {
    return [
      { month: 'Jan', inProgress: Math.floor(Math.random() * 50) + 20, scheduled: Math.floor(Math.random() * 40) + 15, completed: Math.floor(Math.random() * 60) + 30 },
      { month: 'Feb', inProgress: Math.floor(Math.random() * 50) + 25, scheduled: Math.floor(Math.random() * 40) + 18, completed: Math.floor(Math.random() * 60) + 35 },
      { month: 'Mar', inProgress: Math.floor(Math.random() * 50) + 30, scheduled: Math.floor(Math.random() * 40) + 22, completed: Math.floor(Math.random() * 60) + 40 },
      { month: 'Apr', inProgress: Math.floor(Math.random() * 50) + 28, scheduled: Math.floor(Math.random() * 40) + 20, completed: Math.floor(Math.random() * 60) + 37 },
      { month: 'May', inProgress: Math.floor(Math.random() * 50) + 32, scheduled: Math.floor(Math.random() * 40) + 25, completed: Math.floor(Math.random() * 60) + 41 },
      { month: 'Jun', inProgress: Math.floor(Math.random() * 50) + 35, scheduled: Math.floor(Math.random() * 40) + 28, completed: Math.floor(Math.random() * 60) + 49 },
      { month: 'Jul', inProgress: Math.floor(Math.random() * 50) + 33, scheduled: Math.floor(Math.random() * 40) + 26, completed: Math.floor(Math.random() * 60) + 45 },
      { month: 'Aug', inProgress: Math.floor(Math.random() * 50) + 36, scheduled: Math.floor(Math.random() * 40) + 29, completed: Math.floor(Math.random() * 60) + 50 },
      { month: 'Sep', inProgress: Math.floor(Math.random() * 50) + 34, scheduled: Math.floor(Math.random() * 40) + 27, completed: Math.floor(Math.random() * 60) + 47 },
      { month: 'Oct', inProgress: Math.floor(Math.random() * 50) + 38, scheduled: Math.floor(Math.random() * 40) + 30, completed: Math.floor(Math.random() * 60) + 52 },
      { month: 'Nov', inProgress: Math.floor(Math.random() * 50) + 37, scheduled: Math.floor(Math.random() * 40) + 29, completed: Math.floor(Math.random() * 60) + 51 },
      { month: 'Dec', inProgress: Math.floor(Math.random() * 50) + 40, scheduled: Math.floor(Math.random() * 40) + 32, completed: Math.floor(Math.random() * 60) + 55 }
    ];
  };

  const yearlyData = generateYearlyData(selectedYear);
  const availableYears = [new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2, new Date().getFullYear() - 3];

  // Multi-series bar chart component
  const MultiSeriesBarChart = ({ chartData, title, series }) => (
    <div style={{ height: '300px', padding: '20px' }}>
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#262626' }}>
          {title}
        </div>
      </div>
      <div style={{ height: '250px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around' }}>
        {chartData.map((item, index) => {
          const maxValue = Math.max(...chartData.map(d => Math.max(...series.map(s => d[s.key]))));
          
          return (
            <div key={index} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', height: '200px', gap: '4px' }}>
                {series.map((s, seriesIndex) => {
                  const barHeight = (item[s.key] / maxValue) * 200;
                  return (
                    <div
                      key={seriesIndex}
                      style={{
                        width: '12px',
                        height: `${barHeight}px`,
                        backgroundColor: s.color,
                        borderRadius: '2px 2px 0 0',
                        transition: 'all 0.3s ease',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.opacity = '0.8';
                        e.target.style.transform = 'scale(1.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.opacity = '1';
                        e.target.style.transform = 'scale(1)';
                      }}
                      title={`${item.month} - ${s.name}: ${item[s.key]}`}
                    />
                  );
                })}
              </div>
              <div style={{ fontSize: '12px', color: '#8c8c8c', textAlign: 'center', marginTop: '8px' }}>
                {item.month}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Legend */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '10px' }}>
        {series.map((s, index) => (
          <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '12px', height: '12px', backgroundColor: s.color, borderRadius: '2px' }}></div>
            <span style={{ fontSize: '12px', color: '#8c8c8c' }}>{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  );

  // Simple line chart component
  const SimpleLineChart = ({ chartData, title, lines }) => (
    <div style={{ height: '300px', padding: '20px' }}>
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#262626' }}>
          {title}
        </div>
      </div>
      <div style={{ height: '250px', position: 'relative' }}>
        {/* Grid lines */}
        {[0, 50, 100, 150].map((value, index) => (
          <div
            key={index}
            style={{
              position: 'absolute',
              left: '40px',
              right: '20px',
              top: `${200 - (value * 1.3)}px`,
              borderTop: '1px solid #f0f0f0',
              fontSize: '10px',
              color: '#8c8c8c'
            }}
          >
            {value}
          </div>
        ))}
        
        {/* Chart lines */}
        {lines.map((line, lineIndex) => {
          const points = chartData.map((item, index) => {
            const x = 40 + (index * (600 / chartData.length));
            const maxValue = Math.max(...chartData.map(d => Math.max(...lines.map(l => d[l.key]))));
            const y = 200 - ((item[line.key] / maxValue) * 180);
            return `${x},${y}`;
          }).join(' ');
          
          return (
            <div key={lineIndex}>
              <svg
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none'
                }}
              >
                <polyline
                  points={points}
                  fill="none"
                  stroke={line.color}
                  strokeWidth="2"
                />
                {chartData.map((item, index) => {
                  const x = 40 + (index * (600 / chartData.length));
                  const maxValue = Math.max(...chartData.map(d => Math.max(...lines.map(l => d[l.key]))));
                  const y = 200 - ((item[line.key] / maxValue) * 180);
                  
                  return (
                    <circle
                      key={index}
                      cx={x}
                      cy={y}
                      r="4"
                      fill={line.color}
                      style={{ cursor: 'pointer', pointerEvents: 'all' }}
                      title={`${item.month}: ${item[line.key]}`}
                    />
                  );
                })}
              </svg>
            </div>
          );
        })}
        
        {/* X-axis labels */}
        <div style={{ position: 'absolute', bottom: '0', left: '40px', right: '20px', display: 'flex', justifyContent: 'space-between' }}>
          {chartData.map((item, index) => (
            <div key={index} style={{ fontSize: '12px', color: '#8c8c8c', textAlign: 'center' }}>
              {item.month}
            </div>
          ))}
        </div>
      </div>
      
      {/* Legend */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '10px' }}>
        {lines.map((line, index) => (
          <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '12px', height: '12px', backgroundColor: line.color, borderRadius: '50%' }}></div>
            <span style={{ fontSize: '12px', color: '#8c8c8c' }}>{line.name}</span>
          </div>
        ))}
      </div>
    </div>
  );

  // Simple pie chart component
  const SimplePieChart = ({ chartData, title }) => {
    const total = chartData.reduce((sum, item) => sum + item.value, 0);
    let currentAngle = 0;
    
    return (
      <div style={{ height: '300px', padding: '20px' }}>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#262626' }}>
            {title}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
          {/* Pie chart */}
          <div style={{ position: 'relative', width: '150px', height: '150px' }}>
            <svg width="150" height="150" style={{ transform: 'rotate(-90deg)' }}>
              {chartData.map((item, index) => {
                const percentage = (item.value / total) * 100;
                const angle = (percentage / 100) * 360;
                const endAngle = currentAngle + angle;
                
                const x1 = 75 + 60 * Math.cos((currentAngle * Math.PI) / 180);
                const y1 = 75 + 60 * Math.sin((currentAngle * Math.PI) / 180);
                const x2 = 75 + 60 * Math.cos((endAngle * Math.PI) / 180);
                const y2 = 75 + 60 * Math.sin((endAngle * Math.PI) / 180);
                
                const largeArcFlag = angle > 180 ? 1 : 0;
                
                const pathData = 'M 75 75 L ' + x1 + ' ' + y1 + ' A 60 60 0 ' + largeArcFlag + ' 1 ' + x2 + ' ' + y2 + ' Z';
                
                currentAngle = endAngle;
                
                return (
                  <path
                    key={index}
                    d={pathData}
                    fill={item.color}
                    stroke="white"
                    strokeWidth="2"
                    style={{ cursor: 'pointer' }}
                    title={`${item.name}: ${item.value} (${percentage.toFixed(1)}%)`}
                  />
                );
              })}
            </svg>
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: '18px',
              fontWeight: 'bold',
              color: '#262626'
            }}>
              {total}
            </div>
          </div>
          
          {/* Legend */}
          <div>
            {chartData.map((item, index) => {
              const percentage = ((item.value / total) * 100).toFixed(1);
              return (
                <div key={index} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{
                    width: '12px',
                    height: '12px',
                    backgroundColor: item.color,
                    borderRadius: '50%',
                    marginRight: '8px'
                  }}></div>
                  <span style={{ fontSize: '12px', color: '#8c8c8c', marginRight: '8px' }}>
                    {item.name}:
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#262626' }}>
                    {item.value} ({percentage}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  if (!data.monthlyData.length && !data.statusData.length) {
    return (
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card>
            <Empty description="No analytics data available" />
          </Card>
        </Col>
      </Row>
    );
  }

  return (
    <Row gutter={[16, 16]}>
      {/* Monthly Bar Chart */}
      <Col xs={24} lg={12}>
        <Card
          title={
            <Space>
              <BarChartOutlined style={{ color: '#1890ff' }} />
              <span>Monthly Order Status Overview</span>
            </Space>
          }
          style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)' }}
        >
          <MultiSeriesBarChart
            chartData={data.monthlyData}
            title="Monthly Status Breakdown"
            series={[
              { key: 'inProgress', name: 'In Progress', color: '#f97316' },
              { key: 'scheduled', name: 'Scheduled', color: '#8b5cf6' },
              { key: 'completed', name: 'Completed', color: '#10b981' }
            ]}
          />
        </Card>
      </Col>

      {/* Yearly Line Chart with Year Selection */}
      <Col xs={24} lg={12}>
        <Card
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <LineChartOutlined style={{ color: '#52c41a' }} />
                <span>Yearly Order Trends</span>
              </Space>
              <Select
                value={selectedYear}
                onChange={(value) => setSelectedYear(value)}
                style={{ width: 100 }}
                size="small"
              >
                {availableYears.map(year => (
                  <Select.Option key={year} value={year}>{year}</Select.Option>
                ))}
              </Select>
            </div>
          }
          style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)' }}
        >
          <SimpleLineChart
            chartData={yearlyData}
            title={`${selectedYear} Order Trends`}
            lines={[
              { key: 'inProgress', name: 'In Progress', color: '#f97316' },
              { key: 'scheduled', name: 'Scheduled', color: '#8b5cf6' },
              { key: 'completed', name: 'Completed', color: '#10b981' }
            ]}
          />
        </Card>
      </Col>
    </Row>
  );
};

export default AnalyticsCharts;