import React from "react";
import { useDraggable, useDroppable, pointerWithin } from "@dnd-kit/core";
import { HolderOutlined } from "@ant-design/icons";

export const partDragId = (id) => `part-${id}`;
export const productDropId = (id) => `product-${id}`;
export const assemblyDropId = (id) => `assembly-${id}`;

export const parseDragId = (id) => {
  if (!id || typeof id !== "string") return null;
  if (id.startsWith("part-")) {
    return { kind: "part", id: Number(id.slice(5)) };
  }
  if (id.startsWith("product-")) {
    return { kind: "product", id: Number(id.slice(8)) };
  }
  if (id.startsWith("assembly-")) {
    return { kind: "assembly", id: Number(id.slice(9)) };
  }
  return null;
};

export const findAssemblyInTree = (assemblies, assemblyId) => {
  for (const asm of assemblies || []) {
    if (asm.id === assemblyId) return asm;
    const nested = findAssemblyInTree(asm.child_assemblies, assemblyId);
    if (nested) return nested;
  }
  return null;
};

export const getLocationLabel = ({ assemblyId, product, assemblies }) => {
  if (!assemblyId) {
    return `Direct under product "${product?.product_name || "Product"}"`;
  }
  const asm = findAssemblyInTree(assemblies, assemblyId);
  if (!asm) return `Under assembly #${assemblyId}`;
  const kind = asm.parent_id ? "Sub-Assembly" : "Assembly";
  return `Under ${kind} "${asm.assembly_name}" (${asm.assembly_number})`;
};

/** Keep ghost away from cursor so it does not cover the drop target name. */
export const dragOverlayOffset = ({ transform }) =>
  transform
    ? {
        ...transform,
        x: transform.x + 20,
        y: transform.y + 28,
      }
    : transform;

export const bomCollisionDetection = (args) => {
  const parentContainers = args.droppableContainers.filter((c) => {
    const id = String(c.id);
    return id.startsWith("product-") || id.startsWith("assembly-");
  });

  const pointerHits = pointerWithin({
    ...args,
    droppableContainers: parentContainers,
  });

  if (pointerHits.length === 0) return [];

  const ranked = [...pointerHits].sort((a, b) => {
    const ca = parentContainers.find((c) => c.id === a.id);
    const cb = parentContainers.find((c) => c.id === b.id);
    const ra = ca?.rect?.current;
    const rb = cb?.rect?.current;
    const areaA = ra ? ra.width * ra.height : Number.MAX_SAFE_INTEGER;
    const areaB = rb ? rb.width * rb.height : Number.MAX_SAFE_INTEGER;
    const aIsAsm = String(a.id).startsWith("assembly-") ? 0 : 1;
    const bIsAsm = String(b.id).startsWith("assembly-") ? 0 : 1;
    if (areaA !== areaB) return areaA - areaB;
    return aIsAsm - bIsAsm;
  });

  return [ranked[0]];
};

export const DraggablePartRow = ({
  partId,
  disabled,
  children,
  className,
  style,
  ...rest
}) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: partDragId(partId),
    disabled: !!disabled,
    data: { type: "part", partId },
  });

  return (
    <div
      ref={setNodeRef}
      className={className}
      style={{
        ...style,
        opacity: isDragging ? 0.35 : style?.opacity,
        outline: isDragging ? "1px dashed #94a3b8" : undefined,
        background: isDragging ? "#f8fafc" : style?.background,
      }}
      {...rest}
    >
      <div className="flex items-center gap-1 flex-1 min-w-0">
        {!disabled && (
          <button
            type="button"
            className="pdm-bom-drag-handle"
            title="Drag to move"
            aria-label="Drag to move part"
            onClick={(e) => e.stopPropagation()}
            {...listeners}
            {...attributes}
          >
            <HolderOutlined />
          </button>
        )}
        <div className="flex items-center gap-3 flex-1 min-w-0 min-h-0">
          {children}
        </div>
      </div>
    </div>
  );
};

export const DroppableParentRow = ({
  dropId,
  disabled,
  children,
  className,
  style,
  dropLabel,
  isOverClassName = "pdm-bom-drop-over",
  ...rest
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    disabled: !!disabled,
    data: { dropId, dropLabel: dropLabel || null },
  });

  const overStyle =
    isOver && !disabled
      ? {
          outline: "2px solid #1677ff",
          outlineOffset: -2,
          backgroundColor: "#e6f4ff",
          boxShadow: "inset 4px 0 0 #1677ff",
        }
      : null;

  return (
    <div
      ref={setNodeRef}
      className={`${className || ""}${isOver && !disabled ? ` ${isOverClassName}` : ""}`}
      style={{ ...style, ...overStyle }}
      {...rest}
    >
      {children}
    </div>
  );
};
