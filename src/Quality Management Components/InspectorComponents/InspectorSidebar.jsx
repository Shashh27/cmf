import React, { useState } from 'react';
import { Typography } from 'antd';

import iconBinJpg from '../../assets/QMS icons/bin.jpg';
import iconBinGif from '../../assets/QMS icons/bin.gif';
import iconBrainPng from '../../assets/QMS icons/brain_icon.png';
import iconBrainGif from '../../assets/QMS icons/brain-process.gif';
import iconDropPng from '../../assets/QMS icons/drop.png';
import iconNotesJpg from '../../assets/QMS icons/notes.jpg';
import iconNotesGif from '../../assets/QMS icons/notes.gif';
import iconResizeJpg from '../../assets/QMS icons/resize.jpg';
import iconResizeGif from '../../assets/QMS icons/resize.gif';
import iconRotateJpg from '../../assets/QMS icons/rotate.jpg';
import iconRotateGif from '../../assets/QMS icons/rotate.gif';
import iconSealJpg from '../../assets/QMS icons/seal.jpg';
import iconSealGif from '../../assets/QMS icons/seal.gif';
import iconSelectJpg from '../../assets/QMS icons/select.jpg';
import iconSelectGif from '../../assets/QMS icons/select.gif';
import iconZoomInJpg from '../../assets/QMS icons/zoom-in.jpg';
import iconZoomInGif from '../../assets/QMS icons/zoom-in.gif';
import iconZoomOutJpg from '../../assets/QMS icons/zoom-out.jpg';
import iconZoomOutGif from '../../assets/QMS icons/zoom-out.gif';

const { Text } = Typography;

const C = {
  label: '#595959',
  labelActive: '#262626',
  danger: '#cf1322',
  header: '#8c8c8c',
  border: '#d9d9d9',
  borderActive: '#bfbfbf',
  surface: '#ffffff',
  surfaceActive: '#f5f5f5',
  rail: '#fafafa',
  divider: '#f0f0f0',
};

const SidebarDivider = () => (
  <div style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '10px 12px' }}>
    <div style={{ flex: 1, height: 1, background: C.divider }} />
    <div
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        border: `1px solid ${C.border}`,
        margin: '0 8px',
        background: C.surface,
      }}
    />
    <div style={{ flex: 1, height: 1, background: C.divider }} />
  </div>
);

const SidebarItemRaster = ({
  staticSrc,
  animatedSrc,
  label,
  active = false,
  danger = false,
  onClick,
  disabled = false,
}) => {
  const [hover, setHover] = useState(false);
  const labelColor = danger ? C.danger : active ? C.labelActive : C.label;
  const showAnimated = Boolean(animatedSrc) && hover && !disabled;

  const ICON = 46;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        width: '100%',
        padding: '8px 0',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        onMouseEnter={() => {
          if (!disabled) setHover(true);
        }}
        onMouseLeave={() => setHover(false)}
        aria-label={label}
        style={{
          border: 'none',
          background: 'transparent',
          padding: 2,
          margin: 0,
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 0,
        }}
      >
        <img
          src={showAnimated ? animatedSrc : staticSrc}
          alt=""
          width={ICON}
          height={ICON}
          draggable={false}
          style={{ display: 'block', objectFit: 'contain', pointerEvents: 'none', userSelect: 'none' }}
        />
      </button>
      <Text style={{ fontSize: 11, color: labelColor, fontWeight: 500 }}>{label}</Text>
    </div>
  );
};

const SectionHeader = ({ title }) => (
  <div style={{ padding: '12px 0 4px 0', width: '100%', textAlign: 'center' }}>
    <Text strong style={{ fontSize: 10, color: C.header, letterSpacing: '0.08em' }}>
      {title}
    </Text>
  </div>
);

const InspectorSidebar = ({
  activeTool = 'select',
  onToolChange,
  onZoomIn,
  onZoomOut,
  onRotate,
  onResetView,
  onClearAll,
  onAutoBalloon,
  clearAllDisabled = false,
  autoBalloonDisabled = false,
  /** When plan is confirmed, block editing tools that change characteristics */
  planEditLocked = false,
  /** Operator measure mode: show pan/view/clear only; hide select, stamp, notes, auto balloon */
  operatorRestricted = false,
}) => {
  const set = (t) => () => {
    if (planEditLocked && (t === 'select' || t === 'stamp')) return;
    onToolChange?.(t);
  };

  return (
    <div
      style={{
        width: 85,
        background: C.rail,
        borderRight: `1px solid ${C.divider}`,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        alignItems: 'center',
        overflowY: 'auto',
        overflowX: 'hidden',
        boxShadow: 'inset -1px 0 0 rgba(0,0,0,0.02)',
      }}
    >
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <SectionHeader title="TOOLS" />
        {!operatorRestricted && (
          <>
            <SidebarItemRaster
              staticSrc={iconSelectJpg}
              animatedSrc={iconSelectGif}
              label="Select"
              active={activeTool === 'select'}
              disabled={planEditLocked}
              onClick={set('select')}
            />
            <SidebarItemRaster staticSrc={iconDropPng} label="Pan" active={activeTool === 'pan'} onClick={set('pan')} />
            <SidebarItemRaster
              staticSrc={iconSealJpg}
              animatedSrc={iconSealGif}
              label="Stamp"
              active={activeTool === 'stamp'}
              disabled={planEditLocked}
              onClick={set('stamp')}
            />
            <SidebarItemRaster
              staticSrc={iconNotesJpg}
              animatedSrc={iconNotesGif}
              label="Notes"
              active={activeTool === 'notes'}
              onClick={set('notes')}
            />
          </>
        )}
        {operatorRestricted && (
          <SidebarItemRaster staticSrc={iconDropPng} label="Pan" active={activeTool === 'pan'} onClick={set('pan')} />
        )}

        <SidebarDivider />
        <SectionHeader title="VIEW" />
        <SidebarItemRaster staticSrc={iconZoomInJpg} animatedSrc={iconZoomInGif} label="Zoom In" onClick={onZoomIn} />
        <SidebarItemRaster staticSrc={iconZoomOutJpg} animatedSrc={iconZoomOutGif} label="Zoom Out" onClick={onZoomOut} />
        <SidebarItemRaster staticSrc={iconRotateJpg} animatedSrc={iconRotateGif} label="Rotate" onClick={onRotate} />
        <SidebarItemRaster staticSrc={iconResizeJpg} animatedSrc={iconResizeGif} label="Reset" onClick={onResetView} />

        <SidebarDivider />

        <SectionHeader title="ACTIONS" />
        {!operatorRestricted && (
          <SidebarItemRaster
            staticSrc={iconBrainPng}
            animatedSrc={iconBrainGif}
            label="Auto Balloon"
            disabled={autoBalloonDisabled || planEditLocked}
            onClick={autoBalloonDisabled || planEditLocked ? undefined : onAutoBalloon}
          />
        )}
        <SidebarItemRaster
          staticSrc={iconBinJpg}
          animatedSrc={iconBinGif}
          label="Clear All"
          danger
          onClick={onClearAll}
          disabled={clearAllDisabled || planEditLocked}
        />
      </div>
    </div>
  );
};

export default InspectorSidebar;
