import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { Downloader } from './features/downloader/Downloader';
import { useTheme } from './context/ThemeContext';

interface ImageAdjustments {
  brightness: number;  // 0–200, 100 = normal
  contrast: number;    // 0–200, 100 = normal
  saturation: number;  // 0–200, 100 = normal
  hue: number;         // -180 to 180, 0 = normal
  blur: number;        // 0–20 px
}

interface Layer {
  id: string;
  type: 'image' | 'text';
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // en grados
  zIndex: number;
  // Campos de Texto
  text?: string;
  color?: string;
  borderColor?: string;
  borderWidth?: number;
  fontSize?: number;
  fontFamily?: string;
  textBackgroundColor?: string; // Fondo opcional detrás del texto
  // Campos de Imagen
  imageUrl?: string;
  adjustments?: ImageAdjustments; // Ajustes de color (mini-photoshop)
}

// Ajustes "neutros" — equivalen a no aplicar ningún filtro CSS.
const defaultAdjustments = (): ImageAdjustments => ({
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  blur: 0,
});

// Convierte los ajustes a un string CSS `filter` o a un string para `ctx.filter`.
// Devuelve cadena vacía si todos los valores son neutros (no aplicar nada).
const adjustmentsToFilter = (a?: ImageAdjustments): string => {
  if (!a) return '';
  const isDefault =
    a.brightness === 100 &&
    a.contrast === 100 &&
    a.saturation === 100 &&
    a.hue === 0 &&
    a.blur === 0;
  if (isDefault) return '';
  return [
    `brightness(${a.brightness}%)`,
    `contrast(${a.contrast}%)`,
    `saturate(${a.saturation}%)`,
    `hue-rotate(${a.hue}deg)`,
    a.blur > 0 ? `blur(${a.blur}px)` : '',
  ]
    .filter(Boolean)
    .join(' ');
};

type TabType = 'remover' | 'meme' | 'downloader';

export default function App() {
  const { theme, toggleTheme, ThemeIcon } = useTheme();
  const [activeTab, setActiveTab] = useState<TabType>('meme');
  const [apiUrl] = useState<string>(() => {
    return localStorage.getItem('hf_space_url') || import.meta.env.VITE_API_URL || 'https://cdecevin-sasgenerator.hf.space';
  });
  const [downloaderUrl] = useState<string>(() => {
    return localStorage.getItem('hf_downloader_url') || import.meta.env.VITE_DOWNLOADER_API_URL || 'https://cdecevin-sasdownloader.hf.space';
  });
  // URL del video en el formulario del descargador (controlada desde el padre
  // para permitir que el paste global la rellene desde otra pestaña).
  const [ytFormUrl, setYtFormUrl] = useState<string>('');

  // --- Estados de Quitar Fondo ---
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Estados del Generador de Memes ---
  const [canvasWidth, setCanvasWidth] = useState<number>(1000);
  const [canvasHeight, setCanvasHeight] = useState<number>(700);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  // Capa cuyo texto se está editando en línea (textarea overlay).
  // Cuando es null, las capas de texto se renderizan como divs (modo display).
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  // ID de la capa cuyo menú de 3 puntos está abierto (popover).
  const [layerMenuOpenId, setLayerMenuOpenId] = useState<string | null>(null);
  const [canvasBackground, setCanvasBackground] = useState<{
    type: 'color' | 'image';
    value: string;
  }>({ type: 'color', value: 'transparent' });
  const [preset, setPreset] = useState<string>('original');
  const [layerCounter, setLayerCounter] = useState<number>(1);

  // Historial para deshacer (Ctrl+Z) y arrastre de capas en la lista
  const [history, setHistory] = useState<Layer[][]>([]);
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);

  const saveHistory = (currentLayers: Layer[]) => {
    setHistory(prev => {
      const newHistory = [...prev, currentLayers];
      if (newHistory.length > 50) {
        newHistory.shift();
      }
      return newHistory;
    });
  };

  const handleUndo = () => {
    setHistory(prev => {
      if (prev.length === 0) return prev;
      const newHistory = [...prev];
      const previousState = newHistory.pop();
      if (previousState) {
        setLayers(previousState);
      }
      return newHistory;
    });
  };

  // --- Referencias y Responsividad ---
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [canvasScale, setCanvasScale] = useState<number>(1);
  const canvasRef = useRef<HTMLDivElement>(null);
  const bgFileInputRef = useRef<HTMLInputElement>(null);
  const layerFileInputRef = useRef<HTMLInputElement>(null);

  // Lógica de arrastre de capas
  const [activeAction, setActiveAction] = useState<{
    type: 'drag' | 'resize' | 'rotate';
    handle?: 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r';
    layerId: string;
    startX: number;
    startY: number;
    startLayerX: number;
    startLayerY: number;
    startLayerW: number;
    startLayerH: number;
    startLayerRot: number;
  } | null>(null);


  // Atajos de teclado: Delete/Backspace para eliminar capa, Ctrl+Z para deshacer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || document.activeElement?.getAttribute('contenteditable') === 'true') {
        return;
      }

      // Deshacer (Ctrl + Z)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      }

      // Eliminar capa (Delete o Backspace)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedLayerId) {
          e.preventDefault();
          handleDeleteLayer(selectedLayerId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLayerId, layers, history]);

  // Ajustar la escala del lienzo responsivo
  useEffect(() => {
    const updateScale = () => {
      if (!canvasContainerRef.current) return;
      const containerWidth = canvasContainerRef.current.clientWidth;
      const padding = 40; // Margen interno
      const availableWidth = containerWidth - padding;
      
      if (availableWidth < canvasWidth) {
        setCanvasScale(availableWidth / canvasWidth);
      } else {
        setCanvasScale(1);
      }
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [canvasWidth, activeTab]);

  // Prevenir que el navegador abra la imagen al arrastrarla fuera de las zonas de drop
  useEffect(() => {
    const preventDefault = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener('dragover', preventDefault);
    window.addEventListener('drop', preventDefault);

    return () => {
      window.removeEventListener('dragover', preventDefault);
      window.removeEventListener('drop', preventDefault);
    };
  }, []);

  // Cerrar el menú de 3 puntos de capa al hacer clic fuera o pulsar Escape.
  useEffect(() => {
    if (!layerMenuOpenId) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.layer-menu')) return;
      if (target?.closest('.icon-btn[aria-haspopup="menu"]')) return;
      setLayerMenuOpenId(null);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLayerMenuOpenId(null);
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [layerMenuOpenId]);

  // --- PEGAR DESDE EL PORTAPAPELES (global) ---
  // - Imagen: en Quitar Fondo → fuente; en Meme → capa de imagen
  // - Texto: en Meme (con capa de texto seleccionada) → reemplaza; si no → nueva capa
  // - URL de YouTube: cualquier pestaña → salta al Descargador con la URL
  useEffect(() => {
    const isYoutubeUrl = (text: string): boolean => {
      const t = text.trim();
      return /(?:youtube\.com|youtu\.be)/i.test(t);
    };

    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isInputField =
        tag === 'input' || tag === 'textarea' || target?.isContentEditable === true;

      const cd = e.clipboardData;
      if (!cd) return;

      // 1) Imagen del portapapeles
      if (cd.files && cd.files.length > 0) {
        const file = cd.files[0];
        if (file.type.startsWith('image/')) {
          e.preventDefault();
          if (activeTab === 'remover') {
            loadSourceImage(file);
          } else if (activeTab === 'meme') {
            const reader = new FileReader();
            reader.onload = (ev) => {
              addImageLayer(
                ev.target?.result as string,
                'Imagen pegada',
                { x: canvasWidth / 2 - 200, y: canvasHeight / 2 - 200 }
              );
            };
            reader.readAsDataURL(file);
          }
          return;
        }
      }

      // 2) Texto del portapapeles
      const text = cd.getData('text/plain');
      if (!text) return;

      // Las URLs de YouTube SIEMPRE se interceptan, incluso en inputs.
      if (isYoutubeUrl(text)) {
        e.preventDefault();
        setActiveTab('downloader');
        setYtFormUrl(text.trim());
        return;
      }

      // Otro texto: solo actuar si NO está en un input/textarea.
      if (isInputField) return;

      if (activeTab === 'meme') {
        e.preventDefault();
        if (selectedLayerId) {
          const layer = layers.find((l) => l.id === selectedLayerId);
          if (layer && layer.type === 'text') {
            updateSelectedLayer({ text });
            return;
          }
        }
        addTextLayer(text);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
    // loadSourceImage y addImageLayer/addTextLayer/updateSelectedLayer se
    // referencian dentro del handler; al recrear el listener en cada cambio
    // nos aseguramos de usar las versiones más recientes del estado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeTab,
    selectedLayerId,
    layers,
    layerCounter,
    canvasWidth,
    canvasHeight,
  ]);

  // Manejar el cambio de presets de tamaño del lienzo
  const applyPreset = (presetName: string) => {
    setPreset(presetName);
    if (presetName === 'original') {
      setCanvasWidth(1000);
      setCanvasHeight(700);
    } else if (presetName === '1:1') {
      setCanvasWidth(800);
      setCanvasHeight(800);
    } else if (presetName === '16:9') {
      setCanvasWidth(1280);
      setCanvasHeight(720);
    } else if (presetName === '9:16') {
      setCanvasWidth(720);
      setCanvasHeight(1280);
    }
  };

  // -------------------------------------------------------------
  // --- LÓGICA DE QUITAR FONDO (API) ---
  // -------------------------------------------------------------
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      loadSourceImage(files[0]);
    }
  };

  const loadSourceImage = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecciona un archivo de imagen.');
      return;
    }
    setSourceFile(file);
    setResultImage(null);
    setErrorMsg(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      setSourceImage(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      loadSourceImage(files[0]);
    }
  };

  const handleRemoveBackground = async () => {
    if (!sourceFile) return;

    if (!apiUrl) {
      alert('Por favor, configura la variable de entorno VITE_API_URL.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    setProcessingStatus('Enviando imagen al servidor...');

    try {
      const formData = new FormData();
      formData.append('file', sourceFile);

      // Limpiar URL por si tiene barras al final
      const cleanUrl = apiUrl.replace(/\/$/, '');
      
      setProcessingStatus('Procesando fondo con BiRefNet (esto puede tomar unos segundos)...');
      
      const response = await fetch(`${cleanUrl}/remove-bg`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Error del servidor (${response.status})`);
      }

      setProcessingStatus('Generando archivo final...');
      const blob = await response.blob();
      const resultUrl = URL.createObjectURL(blob);
      setResultImage(resultUrl);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error al comunicarse con el Space. Asegúrate de que la URL sea correcta y el Space esté activo.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadResult = () => {
    if (!resultImage) return;
    const link = document.createElement('a');
    link.href = resultImage;
    link.download = `sin-fondo-${Date.now()}.png`;
    link.click();
  };

  const handleSendToCanvas = () => {
    if (!resultImage) return;
    saveHistory(layers);
    
    // Crear una nueva capa de imagen
    const newLayer: Layer = {
      id: `img_${layerCounter}`,
      type: 'image',
      name: `Imagen Recortada ${layerCounter}`,
      x: 100,
      y: 100,
      width: 400,
      height: 400,
      rotation: 0,
      zIndex: layers.length + 1,
      imageUrl: resultImage,
    };

    setLayers([newLayer, ...layers]);
    setLayerCounter(prev => prev + 1);
    setSelectedLayerId(newLayer.id);
    
    // Cambiar a la pestaña de memes
    setActiveTab('meme');
  };

  const handleResetRemover = () => {
    setSourceImage(null);
    setSourceFile(null);
    setResultImage(null);
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // -------------------------------------------------------------
  // --- LÓGICA DEL DESCARGADOR (API) ---
  // -------------------------------------------------------------
  // Moved to src/features/downloader/Downloader.tsx (Fase 1)

  // -------------------------------------------------------------
  // --- LÓGICA DEL GENERADOR DE MEMES (Canvas) ---
  // -------------------------------------------------------------
  const addTextLayer = (initialText?: string) => {
    saveHistory(layers);
    const newLayer: Layer = {
      id: `txt_${layerCounter}`,
      type: 'text',
      name: `Texto ${layerCounter}`,
      x: canvasWidth / 2 - 150,
      y: canvasHeight / 2 - 50,
      width: 300,
      height: 100,
      rotation: 0,
      zIndex: layers.length + 1,
      text: initialText ?? 'DOBLE CLIC AQUÍ',
      color: '#ffffff',
      borderColor: '#000000',
      borderWidth: 2,
      fontSize: 40,
      fontFamily: 'Impact',
    };

    setLayers([newLayer, ...layers]);
    setLayerCounter(prev => prev + 1);
    setSelectedLayerId(newLayer.id);
    // Entrar en modo edición inmediatamente para que el usuario pueda tipar.
    setEditingLayerId(newLayer.id);
  };

  const handleAddText = () => {
    addTextLayer();
  };

  const addImageLayer = (
    imageUrl: string,
    name: string,
    position?: { x: number; y: number }
  ) => {
    saveHistory(layers);
    const newLayer: Layer = {
      id: `img_${layerCounter}`,
      type: 'image',
      name,
      x: position?.x ?? canvasWidth / 2 - 200,
      y: position?.y ?? canvasHeight / 2 - 200,
      width: 400,
      height: 400,
      rotation: 0,
      zIndex: layers.length + 1,
      imageUrl,
    };
    setLayers([newLayer, ...layers]);
    setLayerCounter(prev => prev + 1);
    setSelectedLayerId(newLayer.id);
  };

  const handleAddImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        addImageLayer(event.target?.result as string, files[0].name);
      };
      reader.readAsDataURL(files[0]);
    }
  };

  // --- Manipulación de capas (usada por el menú de 3 puntos) ---
  const duplicateLayer = (id: string) => {
    const layer = layers.find((l) => l.id === id);
    if (!layer) return;
    saveHistory(layers);
    const copy: Layer = {
      ...layer,
      id: `${layer.type === 'text' ? 'txt' : 'img'}_${layerCounter}`,
      name: layer.name + ' (copia)',
      x: layer.x + 20,
      y: layer.y + 20,
      zIndex: layers.length + 1,
    };
    setLayers([copy, ...layers]);
    setLayerCounter((prev) => prev + 1);
    setSelectedLayerId(copy.id);
  };

  const bringToFront = (id: string) => {
    const maxZ = Math.max(...layers.map((l) => l.zIndex), 0);
    saveHistory(layers);
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, zIndex: maxZ + 1 } : l))
    );
  };

  const sendToBack = (id: string) => {
    const minZ = Math.min(...layers.map((l) => l.zIndex), 0);
    saveHistory(layers);
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, zIndex: minZ - 1 } : l))
    );
  };

  const moveLayerUp = (id: string) => {
    const sorted = [...layers].sort((a, b) => a.zIndex - b.zIndex);
    const idx = sorted.findIndex((l) => l.id === id);
    if (idx === -1 || idx === sorted.length - 1) return;
    saveHistory(layers);
    const a = sorted[idx];
    const b = sorted[idx + 1];
    setLayers((prev) =>
      prev.map((l) => {
        if (l.id === a.id) return { ...l, zIndex: b.zIndex };
        if (l.id === b.id) return { ...l, zIndex: a.zIndex };
        return l;
      })
    );
  };

  const moveLayerDown = (id: string) => {
    const sorted = [...layers].sort((a, b) => a.zIndex - b.zIndex);
    const idx = sorted.findIndex((l) => l.id === id);
    if (idx <= 0) return;
    saveHistory(layers);
    const a = sorted[idx];
    const b = sorted[idx - 1];
    setLayers((prev) =>
      prev.map((l) => {
        if (l.id === a.id) return { ...l, zIndex: b.zIndex };
        if (l.id === b.id) return { ...l, zIndex: a.zIndex };
        return l;
      })
    );
  };

  const handleCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const files = e.dataTransfer.files;
    if (files && files[0] && (files[0].type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(files[0].name))) {
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      let dropX = canvasWidth / 2 - 200;
      let dropY = canvasHeight / 2 - 200;

      if (canvasRect) {
        // Calcular la posición relativa al lienzo, considerando la escala
        dropX = (e.clientX - canvasRect.left) / canvasScale - 200;
        dropY = (e.clientY - canvasRect.top) / canvasScale - 200;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        saveHistory(layers);
        const newLayer: Layer = {
          id: `img_${layerCounter}`,
          type: 'image',
          name: files[0].name,
          x: dropX,
          y: dropY,
          width: 400,
          height: 400,
          rotation: 0,
          zIndex: layers.length + 1,
          imageUrl: event.target?.result as string,
        };
        setLayers([newLayer, ...layers]);
        setLayerCounter(prev => prev + 1);
        setSelectedLayerId(newLayer.id);
      };
      reader.readAsDataURL(files[0]);
    }
  };

  const handleDeleteLayer = (idToDelete: string | null) => {
    const targetId = idToDelete || selectedLayerId;
    if (!targetId) return;
    
    saveHistory(layers);
    setLayers(prev => prev.filter(layer => layer.id !== targetId));
    if (selectedLayerId === targetId) {
      setSelectedLayerId(null);
    }
  };

  const handleLayerDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    setDraggedLayerId(id);
  };

  const handleLayerDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleLayerDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain') || draggedLayerId;
    if (!sourceId || sourceId === targetId) return;

    saveHistory(layers);

    setLayers(prev => {
      const sorted = [...prev].sort((a, b) => b.zIndex - a.zIndex); // Mayor zIndex primero (orden de la lista)
      const sourceIndex = sorted.findIndex(l => l.id === sourceId);
      const targetIndex = sorted.findIndex(l => l.id === targetId);
      if (sourceIndex === -1 || targetIndex === -1) return prev;

      // Mover elemento en el array
      const [removed] = sorted.splice(sourceIndex, 1);
      sorted.splice(targetIndex, 0, removed);

      // Reasignar zIndex descendente: el primero de la lista (index 0) tiene el mayor zIndex
      const total = sorted.length;
      return sorted.map((layer, idx) => ({
        ...layer,
        zIndex: total - idx
      }));
    });

    setDraggedLayerId(null);
  };

  const handleBgColorChange = (color: string) => {
    setCanvasBackground({ type: 'color', value: color });
  };

  const handleBgImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCanvasBackground({
          type: 'image',
          value: event.target?.result as string,
        });
      };
      reader.readAsDataURL(files[0]);
    }
  };

  const handleClearBg = () => {
    setCanvasBackground({ type: 'color', value: 'transparent' });
  };

  const updateSelectedLayer = (updates: Partial<Layer>) => {
    if (!selectedLayerId) return;
    saveHistory(layers);
    setLayers(prev => prev.map(layer => {
      if (layer.id === selectedLayerId) {
        const updated = { ...layer, ...updates };
        // Si cambia el texto, actualizamos el nombre de la capa
        if (updates.text !== undefined && layer.type === 'text') {
          let cleanText = updates.text.replace(/\n/g, ' ');
          if (cleanText.length > 20) cleanText = cleanText.substring(0, 17) + '...';
          updated.name = `Texto: ${cleanText || 'Vacío'}`;
        }
        return updated;
      }
      return layer;
    }));
  };

  const selectedLayer = layers.find(l => l.id === selectedLayerId);

  // -------------------------------------------------------------
  // --- MATEMÁTICAS DE ARRASTRE, REDIMENSIONADO Y ROTACIÓN ---
  // -------------------------------------------------------------
  const handleLayerMouseDown = (e: React.MouseEvent, layerId: string, handle?: 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r' | 'rot') => {
    e.preventDefault();
    e.stopPropagation();
    
    setSelectedLayerId(layerId);
    saveHistory(layers);

    const layer = layers.find(l => l.id === layerId);
    if (!layer) return;

    if (handle === 'rot') {
      setActiveAction({
        type: 'rotate',
        layerId,
        startX: e.clientX,
        startY: e.clientY,
        startLayerX: layer.x,
        startLayerY: layer.y,
        startLayerW: layer.width,
        startLayerH: layer.height,
        startLayerRot: layer.rotation,
      });
    } else if (handle) {
      setActiveAction({
        type: 'resize',
        handle,
        layerId,
        startX: e.clientX,
        startY: e.clientY,
        startLayerX: layer.x,
        startLayerY: layer.y,
        startLayerW: layer.width,
        startLayerH: layer.height,
        startLayerRot: layer.rotation,
      });
    } else {
      setActiveAction({
        type: 'drag',
        layerId,
        startX: e.clientX,
        startY: e.clientY,
        startLayerX: layer.x,
        startLayerY: layer.y,
        startLayerW: layer.width,
        startLayerH: layer.height,
        startLayerRot: layer.rotation,
      });
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!activeAction || !canvasRef.current) return;

      const layer = layers.find(l => l.id === activeAction.layerId);
      if (!layer) return;

      const canvasRect = canvasRef.current.getBoundingClientRect();
      
      // Coordenadas actuales del ratón escaladas
      const mx = (e.clientX - canvasRect.left) / canvasScale;
      const my = (e.clientY - canvasRect.top) / canvasScale;

      if (activeAction.type === 'drag') {
        const dx = (e.clientX - activeAction.startX) / canvasScale;
        const dy = (e.clientY - activeAction.startY) / canvasScale;
        
        let newX = activeAction.startLayerX + dx;
        let newY = activeAction.startLayerY + dy;

        // Comportamiento de bordes pegajosos (Sticky borders)
        const RESIST_ZONE = 25;
        if (Math.abs(newX) < RESIST_ZONE) newX = 0;
        if (Math.abs(newX + layer.width - canvasWidth) < RESIST_ZONE) newX = canvasWidth - layer.width;
        if (Math.abs(newY) < RESIST_ZONE) newY = 0;
        if (Math.abs(newY + layer.height - canvasHeight) < RESIST_ZONE) newY = canvasHeight - layer.height;

        setLayers(prev => prev.map(l => {
          if (l.id === layer.id) {
            return { ...l, x: newX, y: newY };
          }
          return l;
        }));
      } 
      else if (activeAction.type === 'rotate') {
        // Centro del lienzo
        const cx = layer.x + layer.width / 2;
        const cy = layer.y + layer.height / 2;

        const dy = my - cy;
        const dx = mx - cx;
        
        // Sumamos 90 porque el tirador de rotación está arriba (vector 0, -h/2)
        let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
        
        // Comportamiento magnético a múltiplos de 90° con tolerancia de 5°
        const nearest90 = Math.round(angle / 90) * 90;
        if (Math.abs(angle - nearest90) <= 5) {
          angle = nearest90;
        }

        setLayers(prev => prev.map(l => {
          if (l.id === layer.id) {
            return { ...l, rotation: angle };
          }
          return l;
        }));
      } 
      else if (activeAction.type === 'resize' && activeAction.handle) {
        const rad = (activeAction.startLayerRot * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        // Identificar punto de anclaje local
        let pxLocal = 0;
        let pyLocal = 0;
        if (activeAction.handle === 'br') { pxLocal = 0; pyLocal = 0; } // Anclaje top-left
        else if (activeAction.handle === 'bl') { pxLocal = activeAction.startLayerW; pyLocal = 0; } // Anclaje top-right
        else if (activeAction.handle === 'tr') { pxLocal = 0; pyLocal = activeAction.startLayerH; } // Anclaje bottom-left
        else if (activeAction.handle === 'tl') { pxLocal = activeAction.startLayerW; pyLocal = activeAction.startLayerH; } // Anclaje bottom-right
        else if (activeAction.handle === 't') { pxLocal = activeAction.startLayerW / 2; pyLocal = activeAction.startLayerH; } // Anclaje bottom-center
        else if (activeAction.handle === 'b') { pxLocal = activeAction.startLayerW / 2; pyLocal = 0; } // Anclaje top-center
        else if (activeAction.handle === 'l') { pxLocal = activeAction.startLayerW; pyLocal = activeAction.startLayerH / 2; } // Anclaje right-center
        else if (activeAction.handle === 'r') { pxLocal = 0; pyLocal = activeAction.startLayerH / 2; } // Anclaje left-center

        // Calcular el punto de anclaje en el canvas (coordenadas del mundo)
        const cx = activeAction.startLayerX + activeAction.startLayerW / 2;
        const cy = activeAction.startLayerY + activeAction.startLayerH / 2;
        const pxCentered = pxLocal - activeAction.startLayerW / 2;
        const pyCentered = pyLocal - activeAction.startLayerH / 2;

        const anchorX = cx + pxCentered * cos - pyCentered * sin;
        const anchorY = cy + pxCentered * sin + pyCentered * cos;

        // Vector desde el anclaje hasta el ratón
        const vx = mx - anchorX;
        const vy = my - anchorY;

        // Proyectar vector del ratón en el sistema de coordenadas de la capa
        const projX = vx * cos + vy * sin;
        const projY = -vx * sin + vy * cos;

        let w = activeAction.startLayerW;
        let h = activeAction.startLayerH;

        if (activeAction.handle === 'br') { w = projX; h = projY; }
        else if (activeAction.handle === 'bl') { w = -projX; h = projY; }
        else if (activeAction.handle === 'tr') { w = projX; h = -projY; }
        else if (activeAction.handle === 'tl') { w = -projX; h = -projY; }
        else if (activeAction.handle === 't') { h = -projY; }
        else if (activeAction.handle === 'b') { h = projY; }
        else if (activeAction.handle === 'l') { w = -projX; }
        else if (activeAction.handle === 'r') { w = projX; }

        // Mantener relación de aspecto para imágenes (solo para esquinas)
        const isCorner = ['tl', 'tr', 'bl', 'br'].includes(activeAction.handle);
        if (layer.type === 'image' && isCorner) {
          const aspect = activeAction.startLayerW / activeAction.startLayerH;
          if (Math.abs(w - activeAction.startLayerW) > Math.abs(h - activeAction.startLayerH)) {
            h = w / aspect;
          } else {
            w = h * aspect;
          }
        }

        // Limitar dimensiones mínimas
        w = Math.max(20, w);
        h = Math.max(20, h);

        // Calcular nueva posición top-left del lienzo usando el anclaje local basado en las nuevas dimensiones
        let px = 0;
        let py = 0;
        if (activeAction.handle === 'br') { px = 0; py = 0; }
        else if (activeAction.handle === 'bl') { px = w; py = 0; }
        else if (activeAction.handle === 'tr') { px = 0; py = h; }
        else if (activeAction.handle === 'tl') { px = w; py = h; }
        else if (activeAction.handle === 't') { px = w / 2; py = h; }
        else if (activeAction.handle === 'b') { px = w / 2; py = 0; }
        else if (activeAction.handle === 'l') { px = w; py = h / 2; }
        else if (activeAction.handle === 'r') { px = 0; py = h / 2; }

        const newX = anchorX - w / 2 - (px - w / 2) * cos + (py - h / 2) * sin;
        const newY = anchorY - h / 2 - (px - w / 2) * sin - (py - h / 2) * cos;

        setLayers(prev => prev.map(l => {
          if (l.id === layer.id) {
            return {
              ...l,
              width: w,
              height: h,
              x: newX,
              y: newY,
            };
          }
          return l;
        }));
      }
    };

    const handleMouseUp = () => {
      setActiveAction(null);
    };

    if (activeAction) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeAction, canvasScale, canvasWidth, canvasHeight, layers]);

  // Deseleccionar al hacer clic fuera del lienzo
  const handleCanvasContainerMouseDown = () => {
    setSelectedLayerId(null);
  };

  // -------------------------------------------------------------
  // --- EXPORTAR MEME A IMAGEN REAL (Canvas 2D) ---
  // -------------------------------------------------------------
  const loadImageAsync = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous'; // Evitar problemas de origen cruzado (canvas contaminado)
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`No se pudo cargar la imagen: ${src}`));
      img.src = src;
    });
  };

  // Renderiza el meme a un canvas 2D. Compartido por exportar y copiar.
  const renderMemeToCanvas = async (): Promise<HTMLCanvasElement> => {
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo obtener el contexto 2D del Canvas');

    // 1. Dibujar el fondo
    if (canvasBackground.type === 'color') {
      if (canvasBackground.value !== 'transparent') {
        ctx.fillStyle = canvasBackground.value;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      } else {
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      }
    } else if (canvasBackground.type === 'image' && canvasBackground.value) {
      try {
        const bgImg = await loadImageAsync(canvasBackground.value);
        ctx.drawImage(bgImg, 0, 0, canvasWidth, canvasHeight);
      } catch (e) {
        console.error("Error al cargar la imagen de fondo", e);
        ctx.fillStyle = '#2b2b2b';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      }
    }

    // 2. Dibujar las capas en orden inverso de Z-Index (ZIndex ascendente)
    const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);

    for (const layer of sortedLayers) {
      ctx.save();

      // Mover el origen de coordenadas al centro de la capa
      const cx = layer.x + layer.width / 2;
      const cy = layer.y + layer.height / 2;
      ctx.translate(cx, cy);

      // Rotar
      ctx.rotate((layer.rotation * Math.PI) / 180);

      if (layer.type === 'image' && layer.imageUrl) {
        // Aplicar los ajustes de color de la capa al filtro del canvas.
        // Se restaura a 'none' después para no afectar a las demás capas.
        ctx.filter = adjustmentsToFilter(layer.adjustments) || 'none';
        try {
          const img = await loadImageAsync(layer.imageUrl);
          ctx.drawImage(img, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
        } catch (e) {
          console.error("Error al cargar la imagen de la capa", layer.id, e);
        } finally {
          ctx.filter = 'none';
        }
      }
      else if (layer.type === 'text' && layer.text) {
        ctx.font = `bold ${layer.fontSize || 40}px ${layer.fontFamily || 'Impact'}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const lines = layer.text.split('\n');
        const fontSize = layer.fontSize || 40;
        const lineHeight = fontSize * 1.1;
        const startY = -((lines.length - 1) * lineHeight) / 2;

        lines.forEach((line, index) => {
          const y = startY + index * lineHeight;

          // Dibujar el borde del clon trasero
          if (layer.borderWidth && layer.borderWidth > 0) {
            ctx.strokeStyle = layer.borderColor || '#000000';
            ctx.lineWidth = layer.borderWidth * 2; // se multiplica por 2 ya que strokeText se expande hacia adentro y afuera
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.strokeText(line, 0, y);
          }

          // Dibujar el frente
          ctx.fillStyle = layer.color || '#ffffff';
          ctx.fillText(line, 0, y);
        });
      }

      ctx.restore();
    }

    return canvas;
  };

  const handleExportMeme = async () => {
    setIsProcessing(true);
    setProcessingStatus('Generando imagen de alta resolución...');

    try {
      const canvas = await renderMemeToCanvas();

      // 3. Descargar
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `meme-${Date.now()}.png`;
      link.click();
    } catch (err: any) {
      console.error(err);
      alert(`Error al exportar: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Estado del botón "Copiar": idle | copying | success | error
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'success' | 'error'>('idle');

  const handleCopyMemeToClipboard = async () => {
    if (copyStatus === 'copying') return;
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
      setCopyStatus('error');
      window.setTimeout(() => setCopyStatus('idle'), 2500);
      return;
    }
    setCopyStatus('copying');
    try {
      const canvas = await renderMemeToCanvas();
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen para el portapapeles.'))),
          'image/png'
        );
      });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopyStatus('success');
    } catch (err) {
      console.error(err);
      setCopyStatus('error');
    } finally {
      window.setTimeout(() => setCopyStatus('idle'), 2000);
    }
  };

  const handleResetCanvas = () => {
    if (window.confirm('¿Estás seguro de que quieres borrar todo el lienzo?')) {
      saveHistory(layers);
      setLayers([]);
      setCanvasBackground({ type: 'color', value: 'transparent' });
      setSelectedLayerId(null);
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <div className="title-container">
          <h1>TheSAS: Meme Studio</h1>
        </div>

        <div className="header-actions">
          <nav className="tabs-header">
            <button
              className={`tab-btn ${activeTab === 'meme' ? 'active' : ''}`}
              onClick={() => setActiveTab('meme')}
            >
              Generador de Memes
            </button>
            <button
              className={`tab-btn ${activeTab === 'remover' ? 'active' : ''}`}
              onClick={() => setActiveTab('remover')}
            >
              Quitar Fondo
            </button>
            <button
              className={`tab-btn ${activeTab === 'downloader' ? 'active' : ''}`}
              onClick={() => setActiveTab('downloader')}
            >
              Descargador
            </button>
          </nav>
          <button
            onClick={toggleTheme}
            className="btn-theme-toggle"
            title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            aria-label="Alternar tema"
          >
            <ThemeIcon className="size-5" />
          </button>
        </div>
      </header>

      <main className="main-content">
        {/* --- PESTAÑA: QUITAR FONDO --- */}
        {activeTab === 'remover' && (
          <div className="bg-remover-container animate-fade-in">
            {/* Panel de imagen origen */}
            <div 
              className={`panel ${!sourceImage ? 'interactive' : ''}`}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => !sourceImage && fileInputRef.current?.click()}
            >
              <span className="panel-title">Original (Antes)</span>
              
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*" 
                style={{ display: 'none' }} 
              />

              {sourceImage ? (
                <>
                  <img src={sourceImage} alt="Antes" className="preview-image" />
                  <div className="actions-row">
                    <button className="btn btn-secondary" onClick={handleResetRemover}>
                      Reiniciar
                    </button>
                    {!resultImage && (
                      <button 
                        className="btn btn-primary" 
                        onClick={handleRemoveBackground}
                        disabled={isProcessing}
                      >
                        Quitar Fondo
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="upload-placeholder">
                  <div className="upload-icon" style={{ fontSize: '48px', fontWeight: 'bold', color: 'var(--primary)' }}>+</div>
                  <h3>Arrastra tu imagen aquí</h3>
                  <p>o haz clic para buscar en tu dispositivo</p>
                </div>
              )}

              {isProcessing && (
                <div className="loading-overlay">
                  <div className="spinner"></div>
                  <span className="loading-text">{processingStatus}</span>
                  <span className="loading-subtext">Utilizando ZhengPeng7/BiRefNet</span>
                </div>
              )}
            </div>

            {/* Panel de imagen resultado */}
            <div className="panel transparency-pattern">
              <span className="panel-title">Sin Fondo (Después)</span>

              {resultImage ? (
                <>
                  <img src={resultImage} alt="Después" className="preview-image" />
                  <div className="actions-row">
                    <button className="btn btn-secondary" onClick={handleDownloadResult}>
                      Guardar PNG
                    </button>
                    <button className="btn btn-accent" onClick={handleSendToCanvas}>
                      Enviar al Editor de Memes →
                    </button>
                  </div>
                </>
              ) : errorMsg ? (
                <div className="upload-placeholder" style={{ color: 'var(--danger)', padding: '20px' }}>
                  <div style={{ fontSize: '48px', color: 'var(--danger)', fontWeight: 'bold' }}>!</div>
                  <h3>Error al procesar</h3>
                  <p style={{ maxWidth: '350px', fontSize: '13px', marginTop: '10px' }}>{errorMsg}</p>
                  <button className="btn btn-secondary" style={{ marginTop: '15px' }} onClick={() => setErrorMsg(null)}>
                    Reintentar
                  </button>
                </div>
              ) : (
                <div className="upload-placeholder" style={{ opacity: 0.6 }}>
                  <div style={{ fontSize: '48px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>...</div>
                  <h3>El resultado aparecerá aquí</h3>
                  <p>Sube una imagen y haz clic en Quitar Fondo</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- PESTAÑA: GENERADOR DE MEMES --- */}
        {activeTab === 'meme' && (
          <div className="meme-studio-container animate-fade-in">
            {/* Zona del Lienzo */}
            <div className="canvas-area-wrapper" ref={canvasContainerRef}>
              <div className="canvas-size-controls">
                <span>Tamaño:</span>
                <button className={`preset-btn ${preset === 'original' ? 'active' : ''}`} onClick={() => applyPreset('original')}>1000x700</button>
                <button className={`preset-btn ${preset === '1:1' ? 'active' : ''}`} onClick={() => applyPreset('1:1')}>1:1 (Post)</button>
                <button className={`preset-btn ${preset === '16:9' ? 'active' : ''}`} onClick={() => applyPreset('16:9')}>16:9</button>
                <button className={`preset-btn ${preset === '9:16' ? 'active' : ''}`} onClick={() => applyPreset('9:16')}>9:16 (Story)</button>
                
                <div className="canvas-size-input-group" style={{ marginLeft: '10px' }}>
                  <input 
                    type="number" 
                    value={canvasWidth} 
                    onChange={(e) => { setCanvasWidth(Math.max(100, Number(e.target.value))); setPreset('custom'); }} 
                    placeholder="Ancho"
                  />
                  <span>x</span>
                  <input 
                    type="number" 
                    value={canvasHeight} 
                    onChange={(e) => { setCanvasHeight(Math.max(100, Number(e.target.value))); setPreset('custom'); }} 
                    placeholder="Alto"
                  />
                  <span>px</span>
                </div>
              </div>

              <div 
                className="responsive-canvas-container" 
                onMouseDown={handleCanvasContainerMouseDown}
                onDragOver={handleCanvasDragOver}
                onDrop={handleCanvasDrop}
              >
                <div 
                  className="canvas-outer"
                  onDragOver={handleCanvasDragOver}
                  onDrop={handleCanvasDrop}
                  style={{
                    width: `${canvasWidth}px`,
                    height: `${canvasHeight}px`,
                    transform: `scale(${canvasScale})`,
                    transformOrigin: 'center center',
                    margin: `${((canvasHeight * canvasScale - canvasHeight) / 2)}px ${((canvasWidth * canvasScale - canvasWidth) / 2)}px`
                  }}
                >
                  <div 
                    ref={canvasRef}
                    className="canvas-inner transparency-pattern"
                    onDragOver={handleCanvasDragOver}
                    onDrop={handleCanvasDrop}
                    style={{
                      backgroundColor: canvasBackground.type === 'color' ? canvasBackground.value : 'transparent',
                      backgroundImage: canvasBackground.type === 'image' ? `url(${canvasBackground.value})` : 'none',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  >
                    {/* Render de Capas */}
                    {[...layers].sort((a, b) => a.zIndex - b.zIndex).map(layer => {
                      const isSelected = layer.id === selectedLayerId;
                      return (
                        <div
                          key={layer.id}
                          className={`canvas-layer ${isSelected ? 'selected' : ''}`}
                          style={{
                            left: `${layer.x}px`,
                            top: `${layer.y}px`,
                            width: `${layer.width}px`,
                            height: `${layer.height}px`,
                            transform: `rotate(${layer.rotation}deg)`,
                            zIndex: layer.zIndex,
                          }}
                          onMouseDown={(e) => handleLayerMouseDown(e, layer.id)}
                        >
                          {layer.type === 'image' && layer.imageUrl && (
                            <img
                              src={layer.imageUrl}
                              alt={layer.name}
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'fill',
                                pointerEvents: 'none',
                                filter: adjustmentsToFilter(layer.adjustments),
                              }}
                            />
                          )}

                          {layer.type === 'text' && (
                            <div
                              style={{ position: 'relative', width: '100%', height: '100%' }}
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                setSelectedLayerId(layer.id);
                                setEditingLayerId(layer.id);
                              }}
                            >
                              {/* Fondo opcional detrás del texto */}
                              {layer.textBackgroundColor && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    inset: '6%',
                                    background: layer.textBackgroundColor,
                                    borderRadius: 6,
                                    pointerEvents: 'none',
                                  }}
                                />
                              )}

                              {editingLayerId === layer.id ? (
                                <TextLayerEditor
                                  layer={layer}
                                  onChange={(text) => updateSelectedLayer({ text })}
                                  onCommit={() => setEditingLayerId(null)}
                                />
                              ) : (
                                <>
                                  {/* Texto trasero (Borde/Stroke) */}
                                  {layer.borderWidth && layer.borderWidth > 0 && (
                                    <div style={{
                                      position: 'absolute',
                                      top: 0,
                                      left: 0,
                                      width: '100%',
                                      height: '100%',
                                      color: layer.borderColor,
                                      WebkitTextStroke: `${layer.borderWidth * 2}px ${layer.borderColor}`,
                                      fontFamily: layer.fontFamily,
                                      fontSize: `${layer.fontSize}px`,
                                      fontWeight: 'bold',
                                      textAlign: 'center',
                                      whiteSpace: 'pre-wrap',
                                      lineHeight: 1.1,
                                      display: 'flex',
                                      justifyContent: 'center',
                                      alignItems: 'center',
                                      pointerEvents: 'none',
                                    }}>
                                      {layer.text}
                                    </div>
                                  )}
                                  {/* Texto delantero (Relleno) */}
                                  <div style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: '100%',
                                    color: layer.color,
                                    fontFamily: layer.fontFamily,
                                    fontSize: `${layer.fontSize}px`,
                                    fontWeight: 'bold',
                                    textAlign: 'center',
                                    whiteSpace: 'pre-wrap',
                                    lineHeight: 1.1,
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    pointerEvents: 'none',
                                  }}>
                                    {layer.text}
                                  </div>
                                </>
                              )}
                            </div>
                          )}

                          {/* Tiradores de edición cuando está seleccionada */}
                          {isSelected && (
                            <>
                              <div className="handle handle-tl" onMouseDown={(e) => handleLayerMouseDown(e, layer.id, 'tl')} />
                              <div className="handle handle-tr" onMouseDown={(e) => handleLayerMouseDown(e, layer.id, 'tr')} />
                              <div className="handle handle-bl" onMouseDown={(e) => handleLayerMouseDown(e, layer.id, 'bl')} />
                              <div className="handle handle-br" onMouseDown={(e) => handleLayerMouseDown(e, layer.id, 'br')} />
                              
                              <div className="handle handle-t" onMouseDown={(e) => handleLayerMouseDown(e, layer.id, 't')} />
                              <div className="handle handle-b" onMouseDown={(e) => handleLayerMouseDown(e, layer.id, 'b')} />
                              <div className="handle handle-l" onMouseDown={(e) => handleLayerMouseDown(e, layer.id, 'l')} />
                              <div className="handle handle-r" onMouseDown={(e) => handleLayerMouseDown(e, layer.id, 'r')} />
                              
                              <div className="handle-rot-line" />
                              <div className="handle-rot" onMouseDown={(e) => handleLayerMouseDown(e, layer.id, 'rot')} />
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
              </div>
            </div>
          </div>

            {/* Barra lateral de control */}
            <aside className="control-sidebar">
              <div className="sidebar-section">
                <span className="section-title">Añadir Capas</span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn btn-primary" style={{ flex: 1, padding: '10px' }} onClick={handleAddText}>
                    Texto
                  </button>
                  <button className="btn btn-secondary" style={{ flex: 1, padding: '10px' }} onClick={() => layerFileInputRef.current?.click()}>
                    Imagen
                  </button>
                </div>
                <input 
                  type="file" 
                  ref={layerFileInputRef} 
                  onChange={handleAddImageUpload} 
                  accept="image/*" 
                  style={{ display: 'none' }} 
                />
              </div>

              {/* Fondo del lienzo */}
              <div className="sidebar-section">
                <span className="section-title">Fondo del Lienzo</span>
                <div className="color-picker-row">
                  <div className="color-input-wrapper">
                    <input 
                      type="color" 
                      value={canvasBackground.type === 'color' ? canvasBackground.value : '#000000'} 
                      onChange={(e) => handleBgColorChange(e.target.value)} 
                    />
                    <span>Color</span>
                  </div>
                  <button className="btn btn-secondary" style={{ padding: '8px' }} onClick={() => bgFileInputRef.current?.click()}>
                    Subir Imagen
                  </button>
                </div>
                <input 
                  type="file" 
                  ref={bgFileInputRef} 
                  onChange={handleBgImageUpload} 
                  accept="image/*" 
                  style={{ display: 'none' }} 
                />
                {(canvasBackground.type === 'image' || (canvasBackground.type === 'color' && canvasBackground.value !== 'transparent')) && (
                  <button className="btn btn-secondary" style={{ width: '100%', padding: '6px', fontSize: '12px' }} onClick={handleClearBg}>
                    Hacer Transparente
                  </button>
                )}
              </div>

              {/* Lista de Capas */}
              <div className="sidebar-section">
                <span className="section-title">Capas ({layers.length})</span>
                {layers.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', padding: '15px' }}>
                    No hay capas. Adicione texto o imagenes.
                  </div>
                ) : (
                  <div className="layer-list">
                    {layers.map(layer => {
                      const isActive = layer.id === selectedLayerId;
                      const isDragging = layer.id === draggedLayerId;
                      return (
                        <div
                          key={layer.id}
                          className={`layer-item ${isActive ? 'active' : ''} ${isDragging ? 'dragging' : ''}`}
                          onClick={() => setSelectedLayerId(layer.id)}
                          draggable
                          onDragStart={(e) => handleLayerDragStart(e, layer.id)}
                          onDragOver={(e) => handleLayerDragOver(e)}
                          onDrop={(e) => handleLayerDrop(e, layer.id)}
                        >
                          {layer.type === 'image' && layer.imageUrl ? (
                            <img
                              src={layer.imageUrl}
                              alt={layer.name}
                              className="layer-thumbnail"
                              draggable={false}
                            />
                          ) : (
                            <div className="layer-thumbnail layer-thumbnail-text" aria-hidden>
                              T
                            </div>
                          )}
                          <span className="layer-info">{layer.name}</span>
                          <div className="layer-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              className="icon-btn"
                              onClick={() =>
                                setLayerMenuOpenId(
                                  layerMenuOpenId === layer.id ? null : layer.id
                                )
                              }
                              title="Más opciones"
                              aria-label="Más opciones de capa"
                              aria-haspopup="menu"
                              aria-expanded={layerMenuOpenId === layer.id}
                            >
                              ⋮
                            </button>
                            <button className="icon-btn danger" onClick={() => handleDeleteLayer(layer.id)} title="Borrar capa" style={{ fontSize: '10px', fontWeight: 'bold' }}>
                              BORRAR
                            </button>
                          </div>

                          {layerMenuOpenId === layer.id && (
                            <div
                              className="layer-menu animate-fade-in"
                              role="menu"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                className="layer-menu-item"
                                onClick={() => {
                                  duplicateLayer(layer.id);
                                  setLayerMenuOpenId(null);
                                }}
                              >
                                Duplicar capa
                              </button>
                              <button
                                className="layer-menu-item"
                                onClick={() => {
                                  bringToFront(layer.id);
                                  setLayerMenuOpenId(null);
                                }}
                              >
                                Traer al frente
                              </button>
                              <button
                                className="layer-menu-item"
                                onClick={() => {
                                  sendToBack(layer.id);
                                  setLayerMenuOpenId(null);
                                }}
                              >
                                Enviar al fondo
                              </button>
                              <div className="layer-menu-separator" />
                              <button
                                className="layer-menu-item"
                                onClick={() => {
                                  moveLayerUp(layer.id);
                                  setLayerMenuOpenId(null);
                                }}
                              >
                                Subir una posición
                              </button>
                              <button
                                className="layer-menu-item"
                                onClick={() => {
                                  moveLayerDown(layer.id);
                                  setLayerMenuOpenId(null);
                                }}
                              >
                                Bajar una posición
                              </button>
                              <div className="layer-menu-separator" />
                              <button
                                className="layer-menu-item danger"
                                onClick={() => {
                                  handleDeleteLayer(layer.id);
                                  setLayerMenuOpenId(null);
                                }}
                              >
                                Eliminar capa
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Propiedades de Capa Seleccionada */}
              {selectedLayer && (
                <div className="sidebar-section animate-fade-in" style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <span className="section-title" style={{ color: 'var(--primary-hover)' }}>Propiedades de Capa</span>
                  
                  {/* Propiedades si es texto */}
                  {selectedLayer.type === 'text' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div className="form-group">
                        <label>Contenido del Texto</label>
                        <textarea 
                          rows={3} 
                          value={selectedLayer.text || ''} 
                          onChange={(e) => updateSelectedLayer({ text: e.target.value })}
                        />
                      </div>

                      <div className="form-group">
                        <label>Tipografía</label>
                        <select 
                          value={selectedLayer.fontFamily || 'Impact'} 
                          onChange={(e) => updateSelectedLayer({ fontFamily: e.target.value })}
                        >
                          <option value="Impact">Impact (Meme)</option>
                          <option value="Arial">Arial</option>
                          <option value="Courier New">Courier New</option>
                          <option value="Comic Sans MS">Comic Sans</option>
                          <option value="Georgia">Georgia</option>
                          <option value="Outfit">Outfit (Moderna)</option>
                          <option value="Inter">Inter</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Tamaño de Letra</label>
                        <div className="range-control-group">
                          <input 
                            type="range" 
                            min="10" 
                            max="150" 
                            value={selectedLayer.fontSize || 40} 
                            onChange={(e) => updateSelectedLayer({ fontSize: Number(e.target.value) })}
                          />
                          <span>{selectedLayer.fontSize}px</span>
                        </div>
                      </div>

                      <div className="color-picker-row">
                        <div className="form-group">
                          <label>Color Letra</label>
                          <div className="color-input-wrapper">
                            <input 
                              type="color" 
                              value={selectedLayer.color || '#ffffff'} 
                              onChange={(e) => updateSelectedLayer({ color: e.target.value })}
                            />
                            <span>Fill</span>
                          </div>
                        </div>

                        <div className="form-group">
                          <label>Color Borde</label>
                          <div className="color-input-wrapper">
                            <input 
                              type="color" 
                              value={selectedLayer.borderColor || '#000000'} 
                              onChange={(e) => updateSelectedLayer({ borderColor: e.target.value })}
                            />
                            <span>Borde</span>
                          </div>
                        </div>
                      </div>

                      <div className="form-group">
                        <label>Grosor del Borde</label>
                        <div className="range-control-group">
                          <input
                            type="range"
                            min="0"
                            max="20"
                            value={selectedLayer.borderWidth || 0}
                            onChange={(e) => updateSelectedLayer({ borderWidth: Number(e.target.value) })}
                          />
                          <span>{selectedLayer.borderWidth}</span>
                        </div>
                      </div>

                      {/* Fondo opcional del texto */}
                      <div className="form-group">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={Boolean(selectedLayer.textBackgroundColor)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                updateSelectedLayer({ textBackgroundColor: selectedLayer.textBackgroundColor || '#000000' });
                              } else {
                                const { textBackgroundColor: _, ...rest } = selectedLayer;
                                updateSelectedLayer({ ...rest } as Partial<Layer>);
                              }
                            }}
                          />
                          Fondo del texto
                        </label>
                        {selectedLayer.textBackgroundColor && (
                          <div className="color-input-wrapper">
                            <input
                              type="color"
                              value={selectedLayer.textBackgroundColor}
                              onChange={(e) => updateSelectedLayer({ textBackgroundColor: e.target.value })}
                            />
                            <span>Color</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Propiedades si es imagen */}
                  {selectedLayer.type === 'image' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <p>Tipo: Imagen</p>
                      <p>Dimensiones: {Math.round(selectedLayer.width)}x{Math.round(selectedLayer.height)} px</p>
                      <p>Rotación: {Math.round(selectedLayer.rotation)}°</p>
                      <div className="form-group" style={{ marginTop: '10px' }}>
                        <label>Cambiar Tamaño Ancho</label>
                        <input
                          type="number"
                          value={Math.round(selectedLayer.width)}
                          onChange={(e) => {
                            const w = Math.max(10, Number(e.target.value));
                            const aspect = selectedLayer.width / selectedLayer.height;
                            updateSelectedLayer({ width: w, height: w / aspect });
                          }}
                        />
                      </div>

                      {/* Ajustes de color (mini-photoshop) */}
                      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '8px' }}>
                        <span style={{ display: 'block', fontWeight: 600, marginBottom: '8px', color: 'var(--primary-hover)', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.08em' }}>
                          Ajustes de color
                        </span>

                        {(
                          [
                            { key: 'brightness', label: 'Brillo', min: 0, max: 200, step: 1 },
                            { key: 'contrast', label: 'Contraste', min: 0, max: 200, step: 1 },
                            { key: 'saturation', label: 'Saturación', min: 0, max: 200, step: 1 },
                            { key: 'hue', label: 'Tono', min: -180, max: 180, step: 1 },
                            { key: 'blur', label: 'Desenfoque', min: 0, max: 20, step: 0.5 },
                          ] as const
                        ).map(({ key, label, min, max, step }) => {
                          const value = selectedLayer.adjustments?.[key] ?? (
                            key === 'hue' ? 0 : 100
                          );
                          return (
                            <div key={key} className="form-group" style={{ marginBottom: '8px' }}>
                              <div className="range-control-group">
                                <input
                                  type="range"
                                  min={min}
                                  max={max}
                                  step={step}
                                  value={value}
                                  onChange={(e) => {
                                    const next = { ...(selectedLayer.adjustments ?? defaultAdjustments()), [key]: Number(e.target.value) };
                                    updateSelectedLayer({ adjustments: next });
                                  }}
                                />
                                <span style={{ minWidth: 36, textAlign: 'right' }}>{value}{key === 'hue' ? '°' : key === 'blur' ? 'px' : '%'}</span>
                              </div>
                              <label style={{ fontSize: '11px', marginTop: '2px' }}>{label}</label>
                            </div>
                          );
                        })}

                        <button
                          className="btn btn-secondary"
                          style={{ width: '100%', padding: '6px', fontSize: '11px', marginTop: '4px' }}
                          onClick={() => updateSelectedLayer({ adjustments: defaultAdjustments() })}
                        >
                          Restablecer ajustes
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Botones de acción del Lienzo */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: 'auto', paddingTop: '15px', borderTop: '1px solid var(--border-color)' }}>
                <button className="btn btn-accent" onClick={handleExportMeme} disabled={layers.length === 0}>
                  Exportar Meme (PNG)
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleCopyMemeToClipboard}
                  disabled={layers.length === 0 || copyStatus === 'copying'}
                  title="Copia el meme como imagen al portapapeles del sistema"
                  style={
                    copyStatus === 'success'
                      ? { color: 'var(--success)', borderColor: 'var(--success)' }
                      : copyStatus === 'error'
                        ? { color: 'var(--danger)', borderColor: 'var(--danger)' }
                        : undefined
                  }
                >
                  {copyStatus === 'copying'
                    ? 'Copiando…'
                    : copyStatus === 'success'
                      ? '✓ Copiado al portapapeles'
                      : copyStatus === 'error'
                        ? '✗ No se pudo copiar'
                        : 'Copiar al portapapeles'}
                </button>
                <button className="btn btn-secondary" onClick={handleResetCanvas}>
                  Limpiar Lienzo
                </button>
              </div>
            </aside>
          </div>
        )}

        {/* --- PESTAÑA: DESCARGADOR --- */}
        {activeTab === 'downloader' && (
          <Downloader
            apiUrl={downloaderUrl}
            formUrl={ytFormUrl}
            onFormUrlChange={setYtFormUrl}
          />
        )}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* TextLayerEditor — textarea overlay que reemplaza al texto cuando la  */
/* capa está en modo edición. Auto-focus, Enter/Esc para salir.        */
/* ------------------------------------------------------------------ */

interface TextLayerEditorProps {
  layer: Layer;
  onChange: (text: string) => void;
  onCommit: () => void;
}

function TextLayerEditor({ layer, onChange, onCommit }: TextLayerEditorProps) {
  const ref = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.focus();
    ta.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCommit();
    }
    // Enter sin Shift confirma la edición; Shift+Enter inserta salto de línea.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onCommit();
    }
  };

  return (
    <textarea
      ref={ref}
      defaultValue={layer.text ?? ''}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={handleKeyDown}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      spellCheck={false}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'transparent',
        color: layer.color,
        WebkitTextStroke: layer.borderWidth
          ? `${layer.borderWidth * 2}px ${layer.borderColor}`
          : undefined,
        fontFamily: layer.fontFamily,
        fontSize: `${layer.fontSize}px`,
        fontWeight: 'bold',
        textAlign: 'center',
        lineHeight: 1.1,
        padding: 0,
        margin: 0,
        border: 'none',
        outline: 'none',
        resize: 'none',
        backgroundColor: 'transparent',
        caretColor: layer.color,
        overflow: 'hidden',
        zIndex: 2,
      }}
    />
  );
}
