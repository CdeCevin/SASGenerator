import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Eraser, Paintbrush, Undo2, Redo2, ZoomIn, ZoomOut, X, Download, Check } from 'lucide-react';

interface MaskRefinementEditorProps {
  sourceImage: string;      // La imagen original (sin fondo eliminado)
  resultImage: string;      // El resultado del modelo (PNG con transparencia)
  onSave: (newResult: string) => void;
  onClose: () => void;
}

type Tool = 'restore' | 'erase';

const MAX_UNDO = 25;

export function MaskRefinementEditor({ sourceImage, resultImage, onSave, onClose }: MaskRefinementEditorProps) {
  const displayRef = useRef<HTMLCanvasElement>(null);
  const maskRef   = useRef<HTMLCanvasElement>(null);
  const origRef   = useRef<HTMLImageElement | null>(null);

  const [tool, setTool]         = useState<Tool>('erase');
  const [brushSize, setBrushSize] = useState(24);
  const [bgOpacity, setBgOpacity] = useState(0.25);
  const [zoom, setZoom]         = useState(1);
  const [isDrawing, setIsDrawing] = useState(false);
  const [mouseInside, setMouseInside] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [undoStack, setUndoStack] = useState<ImageData[]>([]);
  const [redoStack, setRedoStack] = useState<ImageData[]>([]);

  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const imgSize   = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const getScaledCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = displayRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = imgSize.current.w / (rect.width  / zoom);
    const scaleY = imgSize.current.h / (rect.height / zoom);
    return {
      x: (e.clientX - rect.left)  / zoom * scaleX,
      y: (e.clientY - rect.top)   / zoom * scaleY,
    };
  };

  const renderDisplay = useCallback((mx?: number, my?: number) => {
    const display = displayRef.current;
    const mask    = maskRef.current;
    const orig    = origRef.current;
    if (!display || !mask || !orig) return;

    const ctx = display.getContext('2d')!;
    const { w, h } = imgSize.current;

    ctx.clearRect(0, 0, w, h);

    // 1. Imagen original atenuada como guía
    if (bgOpacity > 0) {
      ctx.save();
      ctx.globalAlpha = bgOpacity;
      ctx.drawImage(orig, 0, 0, w, h);
      ctx.restore();
    }

    // 2. Componer: original + máscara
    const tmp = document.createElement('canvas');
    tmp.width  = w;
    tmp.height = h;
    const tc = tmp.getContext('2d')!;
    tc.drawImage(orig, 0, 0, w, h);
    tc.globalCompositeOperation = 'destination-in';
    tc.drawImage(mask, 0, 0, w, h);
    ctx.drawImage(tmp, 0, 0);

    // 3. Cursor de pincel
    if (mx !== undefined && my !== undefined && mouseInside) {
      const canvasRect = display.getBoundingClientRect();
      const scaleX = canvasRect.width  / w;
      const scaleY = canvasRect.height / h;
      const cx = mx * scaleX;
      const cy = my * scaleY;
      ctx.save();
      ctx.beginPath();
      ctx.arc(mx, my, brushSize / 2, 0, Math.PI * 2);
      ctx.strokeStyle = tool === 'erase'
        ? 'rgba(239, 68, 68, 0.85)'
        : 'rgba(34, 197, 94, 0.85)';
      ctx.lineWidth   = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(mx, my, 2, 0, Math.PI * 2);
      ctx.fillStyle = tool === 'erase' ? '#ef4444' : '#22c55e';
      ctx.fill();
      ctx.restore();
      void cx; void cy; // suppress unused warning
    }
  }, [bgOpacity, brushSize, tool, mouseInside]);

  // ─── Init: cargar imágenes en los canvas ─────────────────────────────────

  useEffect(() => {
    const img  = new Image();
    img.src    = sourceImage;
    img.onload = () => {
      origRef.current = img;
      imgSize.current = { w: img.naturalWidth, h: img.naturalHeight };

      const display = displayRef.current!;
      const mask    = maskRef.current!;
      display.width = img.naturalWidth;
      display.height = img.naturalHeight;
      mask.width    = img.naturalWidth;
      mask.height   = img.naturalHeight;

      // Inicializar la máscara desde el resultado del modelo
      const result = new Image();
      result.src   = resultImage;
      result.onload = () => {
        const mc = mask.getContext('2d')!;
        mc.clearRect(0, 0, mask.width, mask.height);
        mc.drawImage(result, 0, 0, mask.width, mask.height);
        // Guardar el estado inicial en el stack de undo
        const initialData = mc.getImageData(0, 0, mask.width, mask.height);
        setUndoStack([initialData]);
        renderDisplay();
      };
    };
  }, [sourceImage, resultImage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-renderizar cuando cambia zoom, bgOpacity o tool
  useEffect(() => {
    renderDisplay();
  }, [renderDisplay, zoom]);

  // ─── Dibujar en la máscara ────────────────────────────────────────────────

  const paintAt = useCallback((x: number, y: number, fromX?: number, fromY?: number) => {
    const mask = maskRef.current;
    if (!mask) return;
    const mc = mask.getContext('2d')!;

    mc.save();
    mc.lineCap        = 'round';
    mc.lineJoin       = 'round';
    mc.lineWidth      = brushSize;

    if (tool === 'erase') {
      mc.globalCompositeOperation = 'destination-out';
      mc.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      mc.globalCompositeOperation = 'source-over';
      mc.strokeStyle = 'rgba(255,255,255,1)';
    }

    mc.beginPath();
    mc.moveTo(fromX ?? x, fromY ?? y);
    mc.lineTo(x, y);
    mc.stroke();
    mc.restore();
  }, [brushSize, tool]);

  const saveUndoSnapshot = useCallback(() => {
    const mask = maskRef.current;
    if (!mask) return;
    const mc   = mask.getContext('2d')!;
    const data = mc.getImageData(0, 0, mask.width, mask.height);
    setUndoStack(prev => [...prev.slice(-MAX_UNDO + 1), data]);
    setRedoStack([]);
  }, []);

  // ─── Pointer events ───────────────────────────────────────────────────────

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    saveUndoSnapshot();
    const { x, y } = getScaledCoords(e);
    setIsDrawing(true);
    lastPoint.current = { x, y };
    paintAt(x, y, x, y);
    renderDisplay(x, y);
  }, [saveUndoSnapshot, paintAt, renderDisplay]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = getScaledCoords(e);
    setMousePos({ x, y });
    if (!isDrawing) { renderDisplay(x, y); return; }
    paintAt(x, y, lastPoint.current?.x, lastPoint.current?.y);
    lastPoint.current = { x, y };
    renderDisplay(x, y);
  }, [isDrawing, paintAt, renderDisplay]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerUp = useCallback(() => {
    setIsDrawing(false);
    lastPoint.current = null;
  }, []);

  // ─── Undo / Redo ─────────────────────────────────────────────────────────

  const undo = useCallback(() => {
    if (undoStack.length < 2) return;
    const mask = maskRef.current!;
    const mc   = mask.getContext('2d')!;
    const current = mc.getImageData(0, 0, mask.width, mask.height);
    setRedoStack(prev => [...prev, current]);
    const prev = undoStack[undoStack.length - 2];
    mc.putImageData(prev, 0, 0);
    setUndoStack(u => u.slice(0, -1));
    renderDisplay();
  }, [undoStack, renderDisplay]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const mask = maskRef.current!;
    const mc   = mask.getContext('2d')!;
    const current = mc.getImageData(0, 0, mask.width, mask.height);
    setUndoStack(prev => [...prev, current]);
    const next = redoStack[redoStack.length - 1];
    mc.putImageData(next, 0, 0);
    setRedoStack(r => r.slice(0, -1));
    renderDisplay();
  }, [redoStack, renderDisplay]);

  // Ctrl+Z / Ctrl+Y
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  // ─── Guardar / Exportar ───────────────────────────────────────────────────

  const handleSave = useCallback(() => {
    const mask = maskRef.current;
    const orig = origRef.current;
    if (!mask || !orig) return;

    const { w, h } = imgSize.current;
    const out  = document.createElement('canvas');
    out.width  = w;
    out.height = h;
    const oc   = out.getContext('2d')!;

    oc.drawImage(orig, 0, 0, w, h);
    oc.globalCompositeOperation = 'destination-in';
    oc.drawImage(mask, 0, 0, w, h);

    onSave(out.toDataURL('image/png'));
  }, [onSave]);

  const handleDownload = useCallback(() => {
    const mask = maskRef.current;
    const orig = origRef.current;
    if (!mask || !orig) return;

    const { w, h } = imgSize.current;
    const out  = document.createElement('canvas');
    out.width  = w;
    out.height = h;
    const oc   = out.getContext('2d')!;

    oc.drawImage(orig, 0, 0, w, h);
    oc.globalCompositeOperation = 'destination-in';
    oc.drawImage(mask, 0, 0, w, h);

    const link    = document.createElement('a');
    link.download = `sin-fondo-editado-${Date.now()}.png`;
    link.href     = out.toDataURL('image/png');
    link.click();
  }, []);

  // ─── Scroll wheel zoom ────────────────────────────────────────────────────

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.min(4, Math.max(0.25, z - e.deltaY * 0.001)));
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────

  const TOOL_CURSOR = tool === 'erase' ? 'crosshair' : 'cell';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>

      {/* ── Top toolbar ─────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 16px',
        background: 'rgba(17, 19, 28, 0.95)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexWrap: 'wrap',
      }}>

        {/* Title */}
        <span style={{ fontWeight: 700, fontSize: 15, color: '#f8fafc', marginRight: 8 }}>
          Refinar máscara
        </span>

        <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

        {/* Tool toggle */}
        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
          <ToolBtn
            active={tool === 'erase'}
            onClick={() => setTool('erase')}
            label="Borrar"
            color="#ef4444"
            icon={<Eraser size={14} />}
          />
          <ToolBtn
            active={tool === 'restore'}
            onClick={() => setTool('restore')}
            label="Restaurar"
            color="#22c55e"
            icon={<Paintbrush size={14} />}
          />
        </div>

        <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

        {/* Brush size */}
        <label style={{ color: '#94a3b8', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
          Pincel
          <input
            type="range" min={2} max={120} value={brushSize}
            onChange={e => setBrushSize(Number(e.target.value))}
            style={{ width: 80, accentColor: tool === 'erase' ? '#ef4444' : '#22c55e' }}
          />
          <span style={{ color: '#f8fafc', minWidth: 28, textAlign: 'right' }}>{brushSize}px</span>
        </label>

        <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

        {/* Background opacity */}
        <label style={{ color: '#94a3b8', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
          Fondo visible
          <input
            type="range" min={0} max={1} step={0.05} value={bgOpacity}
            onChange={e => { setBgOpacity(Number(e.target.value)); renderDisplay(mousePos.x, mousePos.y); }}
            style={{ width: 80, accentColor: '#8a7bfa' }}
          />
          <span style={{ color: '#f8fafc', minWidth: 34, textAlign: 'right' }}>{Math.round(bgOpacity * 100)}%</span>
        </label>

        <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

        {/* Undo / Redo */}
        <IconBtn onClick={undo} disabled={undoStack.length < 2} title="Deshacer (Ctrl+Z)">
          <Undo2 size={15} />
        </IconBtn>
        <IconBtn onClick={redo} disabled={redoStack.length === 0} title="Rehacer (Ctrl+Y)">
          <Redo2 size={15} />
        </IconBtn>

        <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

        {/* Zoom */}
        <IconBtn onClick={() => setZoom(z => Math.min(4, z + 0.25))} title="Acercar">
          <ZoomIn size={15} />
        </IconBtn>
        <span style={{ color: '#94a3b8', fontSize: 12, minWidth: 40, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </span>
        <IconBtn onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} title="Alejar">
          <ZoomOut size={15} />
        </IconBtn>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Action buttons */}
        <button
          onClick={handleDownload}
          style={{ ...actionBtnStyle, background: 'rgba(255,255,255,0.06)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)' }}
          title="Descargar PNG editado"
        >
          <Download size={14} />
          Descargar
        </button>
        <button
          onClick={handleSave}
          style={{ ...actionBtnStyle, background: '#6355e6', color: '#fff', border: 'none' }}
          title="Guardar y volver"
        >
          <Check size={14} />
          Guardar cambios
        </button>
        <button
          onClick={onClose}
          style={{ ...iconBtnStyle, color: '#94a3b8' }}
          title="Cerrar sin guardar"
        >
          <X size={18} />
        </button>
      </div>

      {/* ── Leyenda de herramienta activa ───────────────────────────────── */}
      <div style={{
        textAlign: 'center', padding: '6px 0',
        fontSize: 12,
        color: tool === 'erase' ? '#fca5a5' : '#86efac',
        background: 'rgba(0,0,0,0.3)',
        letterSpacing: '0.02em',
      }}>
        {tool === 'erase'
          ? '🔴 Borrar — pinta para hacer transparente'
          : '🟢 Restaurar — pinta para recuperar píxeles'}
        &nbsp;·&nbsp; Rueda del ratón para hacer zoom
      </div>

      {/* ── Canvas area ─────────────────────────────────────────────────── */}
      <div style={{
        flex: 1, overflow: 'auto', display: 'flex',
        alignItems: 'flex-start', justifyContent: 'center',
        padding: 24,
      }}>
        <div
          style={{
            position: 'relative',
            backgroundImage: `
              linear-gradient(45deg, #374151 25%, transparent 25%),
              linear-gradient(-45deg, #374151 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, #374151 75%),
              linear-gradient(-45deg, transparent 75%, #374151 75%)
            `,
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
            backgroundColor: '#1f2937',
            borderRadius: 8,
            overflow: 'hidden',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 24px 64px rgba(0,0,0,0.6)',
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
            flexShrink: 0,
          }}
        >
          {/* Invisible mask canvas (off-screen) */}
          <canvas ref={maskRef} style={{ display: 'none' }} />

          {/* Visible display canvas */}
          <canvas
            ref={displayRef}
            style={{ display: 'block', cursor: TOOL_CURSOR, maxWidth: '100%' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => { setMouseInside(false); onPointerUp(); renderDisplay(); }}
            onPointerEnter={() => setMouseInside(true)}
            onWheel={onWheel}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Mini helpers de estilo ────────────────────────────────────────────────

const iconBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: '#94a3b8', padding: '6px 8px', borderRadius: 6,
  display: 'flex', alignItems: 'center',
  transition: 'color 0.15s, background 0.15s',
};

const actionBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '7px 14px', borderRadius: 8,
  cursor: 'pointer', fontSize: 13, fontWeight: 600,
  transition: 'opacity 0.15s, transform 0.1s',
};

function IconBtn({ onClick, disabled, title, children }: {
  onClick: () => void; disabled?: boolean; title?: string; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        ...iconBtnStyle,
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function ToolBtn({ active, onClick, label, color, icon }: {
  active: boolean; onClick: () => void; label: string; color: string; icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
        border: 'none',
        background: active ? color + '22' : 'rgba(255,255,255,0.03)',
        color: active ? color : '#64748b',
        transition: 'all 0.15s',
        boxShadow: active ? `inset 0 0 0 1px ${color}44` : 'none',
      }}
    >
      {icon}{label}
    </button>
  );
}
