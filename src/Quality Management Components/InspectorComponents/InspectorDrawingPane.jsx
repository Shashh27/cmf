import React from 'react';
import { Button, Tooltip } from 'antd';
import { ZoomInOutlined, ZoomOutOutlined, FullscreenOutlined, RetweetOutlined, AimOutlined } from '@ant-design/icons';

const canvasBg = {
  backgroundColor: '#ffffff',
  backgroundImage: 'radial-gradient(#c5cad3 1px, transparent 1px)',
  backgroundSize: '20px 20px',
  backgroundPosition: '0 0',
};

const InspectorDrawingPane = ({ drawingUrl, isPdf }) => {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        flex: 1,
        boxSizing: 'border-box',
        ...canvasBg,
      }}
    >
      {/* Inset viewer so the white dotted canvas is visible around the PDF/image */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          right: 20,
          bottom: 20,
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 0,
        }}
      >
        {drawingUrl ? (
          isPdf ? (
            <iframe
              src={`${drawingUrl}#toolbar=0&navpanes=0&scrollbar=0`}
              width="100%"
              height="100%"
              frameBorder="0"
              style={{
                border: 'none',
                borderRadius: '4px',
                boxShadow: '0 1px 8px rgba(0, 0, 0, 0.08)',
                background: '#f8f8f8',
              }}
              title="PDF Drawing"
            />
          ) : (
            <img
              src={drawingUrl}
              alt="Drawing"
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                boxShadow: '0 0 20px rgba(0,0,0,0.1)',
              }}
            />
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <AimOutlined style={{ fontSize: '48px', color: '#c5cad3' }} />
            <span style={{ color: '#8c8c8c', fontSize: '14px', fontWeight: 500 }}>2D DRAWING CANVAS</span>
          </div>
        )}
      </div>

      {/* Floating controls */}
      <div style={{ position: 'absolute', bottom: '20px', right: '20px', background: 'white', padding: '8px', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', border: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 10 }}>
        <Tooltip placement="left" title="Zoom In">
          <Button icon={<ZoomInOutlined />} type="text" />
        </Tooltip>
        <Tooltip placement="left" title="Zoom Out">
          <Button icon={<ZoomOutOutlined />} type="text" />
        </Tooltip>
        <Tooltip placement="left" title="Fit Screen">
          <Button icon={<FullscreenOutlined />} type="text" />
        </Tooltip>
        <Tooltip placement="left" title="Rotate">
          <Button icon={<RetweetOutlined />} type="text" />
        </Tooltip>
      </div>

      <div style={{ position: 'absolute', bottom: '20px', left: '20px', background: 'rgba(255,255,255,0.8)', padding: '4px 8px', borderRadius: '4px', border: '1px solid #f0f0f0' }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          <span style={{ fontSize: '10px', color: '#8c8c8c' }}>X: 0.000 Y: 0.000</span>
          <span style={{ fontSize: '10px', color: '#8c8c8c' }}>Scale: 1:1</span>
        </div>
      </div>
    </div>
  );
};

export default InspectorDrawingPane;
