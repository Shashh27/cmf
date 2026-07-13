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
  label: '#64748b',
  labelActive: '#0f172a',
  danger: '#dc2626',
  border: 'rgba(148, 163, 184, 0.25)',
  surface: 'rgba(255, 255, 255, 0.95)',
  activeBg: '#e0f2fe',
  activeBorder: '#38bdf8',
  hoverBg: '#f8fafc',
  divider: '#e2e8f0',
  grip: '#cbd5e1',
};

const SCROLL_HIDE = `
  .inspector-toolbar-body {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .inspector-toolbar-body::-webkit-scrollbar {
    display: none;
  }
`;

const GroupDivider = () => (
  <div style={{ width: '55%', height: 1, background: C.divider, margin: '10px auto' }} />
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
  const showAnimated = Boolean(animatedSrc) && hover && !disabled;
  const labelColor = danger ? C.danger : active ? C.labelActive : C.label;

  return (
    <div style={{ width: '100%', padding: '5px 4px', opacity: disabled ? 0.4 : 1 }}>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        onMouseEnter={() => {
          if (!disabled) setHover(true);
        }}
        onMouseLeave={() => setHover(false)}
        aria-label={label}
        aria-pressed={active}
        style={{
          width: '100%',
          minHeight: 62,
          border: active ? `1.5px solid ${danger ? '#fecaca' : C.activeBorder}` : '1.5px solid transparent',
          background: active ? (danger ? '#fef2f2' : C.activeBg) : hover ? C.hoverBg : 'transparent',
          borderRadius: 14,
          padding: '10px 2px 8px',
          margin: 0,
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          transition: 'background 0.15s ease, border-color 0.15s ease',
        }}
      >
        <img
          src={showAnimated ? animatedSrc : staticSrc}
          alt=""
          width={34}
          height={34}
          draggable={false}
          style={{ display: 'block', objectFit: 'contain', pointerEvents: 'none', userSelect: 'none' }}
        />
        <Text
          style={{
            fontSize: 9,
            color: labelColor,
            fontWeight: active ? 600 : 500,
            lineHeight: 1.15,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </Text>
      </button>
    </div>
  );
};

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
  planEditLocked = false,
  operatorRestricted = false,
}) => {
  const set = (t) => () => {
    if (planEditLocked && (t === 'select' || t === 'stamp')) return;
    onToolChange?.(t);
  };

  return (
    <>
      <style>{SCROLL_HIDE}</style>
      <div
        style={{
          width: 72,
          flexShrink: 0,
          alignSelf: 'stretch',
          height: '100%',
          background: C.surface,
          borderRight: `1px solid ${C.border}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          userSelect: 'none',
          overflow: 'hidden',
          padding: '12px 0',
        }}
      >
        <div
          className="inspector-toolbar-body"
          style={{
            width: '100%',
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            paddingBottom: 4,
          }}
        >
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

          <GroupDivider />

          <SidebarItemRaster staticSrc={iconZoomInJpg} animatedSrc={iconZoomInGif} label="Zoom In" onClick={onZoomIn} />
          <SidebarItemRaster staticSrc={iconZoomOutJpg} animatedSrc={iconZoomOutGif} label="Zoom Out" onClick={onZoomOut} />
          <SidebarItemRaster staticSrc={iconRotateJpg} animatedSrc={iconRotateGif} label="Rotate" onClick={onRotate} />
          <SidebarItemRaster staticSrc={iconResizeJpg} animatedSrc={iconResizeGif} label="Reset" onClick={onResetView} />

          <GroupDivider />

          {!operatorRestricted && (
            <>
              <SidebarItemRaster
                staticSrc={iconBrainPng}
                animatedSrc={iconBrainGif}
                label="Auto Balloon"
                disabled={autoBalloonDisabled || planEditLocked}
                onClick={autoBalloonDisabled || planEditLocked ? undefined : onAutoBalloon}
              />
              <SidebarItemRaster
                staticSrc={iconBinJpg}
                animatedSrc={iconBinGif}
                label="Clear All"
                danger
                onClick={onClearAll}
                disabled={clearAllDisabled || planEditLocked}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default InspectorSidebar;
