import React, { useCallback, useEffect, useRef, useState } from 'react';
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

const DragDots = () => (
  <div style={{ display: 'flex', gap: 3, padding: '2px 0' }} aria-hidden="true">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        style={{
          width: 4,
          height: 4,
          borderRadius: '50%',
          background: C.grip,
          display: 'block',
        }}
      />
    ))}
  </div>
);

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
  const toolbarRef = useRef(null);
  const dragState = useRef(null);
  const [position, setPosition] = useState({ x: 16, y: 16 });
  const [dragging, setDragging] = useState(false);

  const set = (t) => () => {
    if (planEditLocked && (t === 'select' || t === 'stamp')) return;
    onToolChange?.(t);
  };

  const clampPosition = useCallback((x, y) => {
    const parent = toolbarRef.current?.offsetParent;
    const toolbar = toolbarRef.current;
    if (!parent || !toolbar) return { x, y };

    const maxX = Math.max(8, parent.clientWidth - toolbar.offsetWidth - 8);
    const maxY = Math.max(8, parent.clientHeight - toolbar.offsetHeight - 8);
    return {
      x: Math.min(Math.max(8, x), maxX),
      y: Math.min(Math.max(8, y), maxY),
    };
  }, []);

  const onDragStart = useCallback(
    (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: position.x,
        originY: position.y,
      };
      setDragging(true);
    },
    [position.x, position.y],
  );

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e) => {
      const d = dragState.current;
      if (!d) return;
      setPosition(clampPosition(d.originX + (e.clientX - d.startX), d.originY + (e.clientY - d.startY)));
    };

    const onUp = () => {
      dragState.current = null;
      setDragging(false);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, clampPosition]);

  return (
    <>
      <style>{SCROLL_HIDE}</style>
      <div
        ref={toolbarRef}
        style={{
          position: 'absolute',
          top: position.y,
          left: position.x,
          width: 72,
          background: C.surface,
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: `1px solid ${C.border}`,
          borderRadius: 32,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          maxHeight: 'calc(100% - 32px)',
          zIndex: 40,
          boxShadow: dragging
            ? '0 14px 36px rgba(15, 23, 42, 0.16)'
            : '0 8px 28px rgba(15, 23, 42, 0.1), 0 2px 8px rgba(15, 23, 42, 0.05)',
          transition: dragging ? 'none' : 'box-shadow 0.2s ease',
          userSelect: 'none',
          overflow: 'hidden',
          padding: '10px 0 18px',
        }}
      >
        {/* Minimal drag handle — no text */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Drag toolbar"
          onMouseDown={onDragStart}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px 0 12px',
            cursor: dragging ? 'grabbing' : 'grab',
          }}
        >
          <DragDots />
        </div>

        <div
          className="inspector-toolbar-body"
          style={{
            width: '100%',
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
    </>
  );
};

export default InspectorSidebar;
