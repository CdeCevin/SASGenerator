import React, { useState, useEffect, useRef } from 'react';
import { ChevronUp, Trash2 } from 'lucide-react';
import './App.css';
import { Downloader } from './features/downloader/Downloader';
import { useTheme } from './context/ThemeContext';

interface ImageAdjustments {
  brightness: number;  // 0–200, 100 = normal
  contrast: number;    // 0–200, 100 = normal
  saturation: number;  // 0–200, 100 = normal
  hue: number;         // -180 to 180, 0 = normal
  blur: number;        // 0–20 px
  invert: number;      // 0–100, 0 = normal, 100 = invertido
  sepia: number;       // 0–100, 0 = normal, 100 = sepia completo
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
  originalImageUrl?: string;
  adjustments?: ImageAdjustments; // Ajustes de color (mini-photoshop)
  curvesPoints?: [number, number][]; // Puntos de curva [input, output]
}

// Ajustes "neutros" — equivalen a no aplicar ningún filtro CSS.
const defaultAdjustments = (): ImageAdjustments => ({
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  blur: 0,
  invert: 0,
  sepia: 0,
});

export function getCurveLUT(points: [number, number][]): Uint8Array {
  const lut = new Uint8Array(256);
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  
  for (let i = 0; i < 256; i++) {
    let p1 = sorted[0];
    let p2 = sorted[sorted.length - 1];
    for (let j = 0; j < sorted.length - 1; j++) {
      if (i >= sorted[j][0] && i <= sorted[j+1][0]) {
        p1 = sorted[j];
        p2 = sorted[j+1];
        break;
      }
    }
    if (p1[0] === p2[0]) {
      lut[i] = p1[1];
    } else {
      const t = (i - p1[0]) / (p2[0] - p1[0]);
      lut[i] = Math.max(0, Math.min(255, Math.round(p1[1] + t * (p2[1] - p1[1]))));
    }
  }
  return lut;
}

export function getSVGTableValues(points: [number, number][]): string {
  const lut = getCurveLUT(points);
  const values: number[] = [];
  for (let i = 0; i < 256; i++) {
    values.push(lut[i] / 255);
  }
  return values.join(' ');
}

// Convierte los ajustes a un string CSS `filter` o a un string para `ctx.filter`.
// Devuelve cadena vacía si todos los valores son neutros (no aplicar nada).
const adjustmentsToFilter = (a?: ImageAdjustments): string => {
  if (!a) return '';
  const isDefault =
    a.brightness === 100 &&
    a.contrast === 100 &&
    a.saturation === 100 &&
    a.hue === 0 &&
    a.blur === 0 &&
    a.invert === 0 &&
    a.sepia === 0;
  if (isDefault) return '';
  return [
    `brightness(${a.brightness}%)`,
    `contrast(${a.contrast}%)`,
    `saturate(${a.saturation}%)`,
    `hue-rotate(${a.hue}deg)`,
    a.blur > 0 ? `blur(${a.blur}px)` : '',
    a.invert > 0 ? `invert(${a.invert}%)` : '',
    a.sepia > 0 ? `sepia(${a.sepia}%)` : '',
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
  // ID de la capa cuyas propiedades están expandidas inline (botón flecha).
  const [expandedLayerId, setExpandedLayerId] = useState<string | null>(null);
  const [canvasBackground, setCanvasBackground] = useState<{
    type: 'color' | 'image';
    value: string;
  }>({ type: 'color', value: 'transparent' });
  const [preset, setPreset] = useState<string>('original');
  const [layerCounter, setLayerCounter] = useState<number>(1);

  // Historial para deshacer (Ctrl+Z) y arrastre de capas en la lista
  const [history, setHistory] = useState<Layer[][]>([]);
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);

  // --- Estados de Modales Auxiliares (Photoshop Layer Styles & Crop) ---
  const [isStylesModalOpen, setIsStylesModalOpen] = useState<boolean>(false);
  const [isCropModalOpen, setIsCropModalOpen] = useState<boolean>(false);
  const [stylesActiveTab, setStylesActiveTab] = useState<'fill' | 'stroke' | 'background' | 'adjustments' | 'curves' | 'presets'>('fill');
  const [backupLayer, setBackupLayer] = useState<Layer | null>(null);

  // Estados del Crop (Recorte)
  const [cropX, setCropX] = useState<number>(0);
  const [cropY, setCropY] = useState<number>(0);
  const [cropW, setCropW] = useState<number>(100);
  const [cropH, setCropH] = useState<number>(100);
  const [cropImgDims, setCropImgDims] = useState<{ width: number; height: number }>({ width: 100, height: 100 });
  const [cropDragMode, setCropDragMode] = useState<'move' | 'resize' | null>(null);
  const [cropDragStart, setCropDragStart] = useState<{ x: number; y: number; cropX: number; cropY: number; cropW: number; cropH: number }>({ x: 0, y: 0, cropX: 0, cropY: 0, cropW: 0, cropH: 0 });
  const [cropDisplayDims, setCropDisplayDims] = useState<{ width: number; height: number }>({ width: 300, height: 200 });

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

  // Cerrar el panel de propiedades expandido al hacer clic fuera o pulsar Escape.
  // Importante: NO cerrar si el click es dentro del sidebar (la scrollbar del
  // sidebar dispara mousedown y cerraba el panel mientras el usuario hacía
  // scroll). Solo cerramos cuando el click es fuera del sidebar o en el canvas.
  useEffect(() => {
    if (!expandedLayerId) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      // Si el click es dentro del sidebar, no cerrar (incluye la scrollbar,
      // los items de la lista, y el propio panel de propiedades).
      if (target?.closest('.control-sidebar')) return;
      // Si el click es en el botón toggle de la flecha, el onClick del botón
      // se encarga de togglear.
      if (target?.closest('.layer-menu-toggle')) return;
      setExpandedLayerId(null);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedLayerId(null);
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [expandedLayerId]);

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
      originalImageUrl: resultImage,
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
      originalImageUrl: imageUrl,
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
  const expandedLayer = layers.find(l => l.id === expandedLayerId);

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

  // Deseleccionar al hacer clic fuera del lienzo (evitando clics en la barra de desplazamiento)
  const handleCanvasContainerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const isVerticalScrollbarClick = e.clientX >= rect.left + e.currentTarget.clientWidth;
    const isHorizontalScrollbarClick = e.clientY >= rect.top + e.currentTarget.clientHeight;
    
    if (isVerticalScrollbarClick || isHorizontalScrollbarClick) {
      return;
    }
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
        try {
          const img = await loadImageAsync(layer.imageUrl);
          if (layer.curvesPoints && layer.curvesPoints.length > 0) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = layer.width;
            tempCanvas.height = layer.height;
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
              if (layer.adjustments) {
                tempCtx.filter = adjustmentsToFilter(layer.adjustments) || 'none';
              }
              tempCtx.drawImage(img, 0, 0, layer.width, layer.height);
              tempCtx.filter = 'none';
              
              const imgData = tempCtx.getImageData(0, 0, layer.width, layer.height);
              const data = imgData.data;
              const lut = getCurveLUT(layer.curvesPoints);
              for (let i = 0; i < data.length; i += 4) {
                data[i] = lut[data[i]];
                data[i+1] = lut[data[i+1]];
                data[i+2] = lut[data[i+2]];
              }
              tempCtx.putImageData(imgData, 0, 0);
              ctx.drawImage(tempCanvas, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
            } else {
              ctx.filter = adjustmentsToFilter(layer.adjustments) || 'none';
              ctx.drawImage(img, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
              ctx.filter = 'none';
            }
          } else {
            ctx.filter = adjustmentsToFilter(layer.adjustments) || 'none';
            ctx.drawImage(img, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
            ctx.filter = 'none';
          }
        } catch (e) {
          console.error("Error al cargar la imagen de la capa", layer.id, e);
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

  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);

  const handleCurvesSVGMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = Math.max(0, Math.min(255, Math.round(((e.clientX - rect.left) / rect.width) * 255)));
    const y = Math.max(0, Math.min(255, Math.round((1 - (e.clientY - rect.top) / rect.height) * 255)));

    const selectedLayer = layers.find(l => l.id === selectedLayerId);
    if (!selectedLayer) return;
    const points = selectedLayer.curvesPoints || [[0, 0], [255, 255]];

    const threshold = 15;
    let foundIdx = -1;
    for (let i = 0; i < points.length; i++) {
      const dist = Math.hypot(points[i][0] - x, points[i][1] - y);
      if (dist < threshold) {
        foundIdx = i;
        break;
      }
    }

    if (foundIdx !== -1) {
      setSelectedPointIndex(foundIdx);
    } else {
      let insertIdx = 0;
      for (let i = 0; i < points.length; i++) {
        if (x > points[i][0]) {
          insertIdx = i + 1;
        }
      }
      const newPoints = [...points];
      newPoints.splice(insertIdx, 0, [x, y]);
      setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, curvesPoints: newPoints } : l));
      setSelectedPointIndex(insertIdx);
    }
  };

  const handleCurvesSVGMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (selectedPointIndex === null) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = Math.max(0, Math.min(255, Math.round(((e.clientX - rect.left) / rect.width) * 255)));
    const y = Math.max(0, Math.min(255, Math.round((1 - (e.clientY - rect.top) / rect.height) * 255)));

    const selectedLayer = layers.find(l => l.id === selectedLayerId);
    if (!selectedLayer) return;
    const points = [...(selectedLayer.curvesPoints || [[0, 0], [255, 255]])];

    const currentPoint = points[selectedPointIndex];
    if (!currentPoint) return;

    if (selectedPointIndex === 0) {
      points[selectedPointIndex] = [0, y];
    } else if (selectedPointIndex === points.length - 1) {
      points[selectedPointIndex] = [255, y];
    } else {
      const minX = points[selectedPointIndex - 1][0] + 5;
      const maxX = points[selectedPointIndex + 1][0] - 5;
      const boundedX = Math.max(minX, Math.min(x, maxX));
      points[selectedPointIndex] = [boundedX, y];
    }

    setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, curvesPoints: points } : l));
  };

  const handleCurvesSVGMouseUp = () => {
    setSelectedPointIndex(null);
  };

  const handleCurvesDoubleClickPoint = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const selectedLayer = layers.find(l => l.id === selectedLayerId);
    if (!selectedLayer) return;
    const points = selectedLayer.curvesPoints || [[0, 0], [255, 255]];
    if (index === 0 || index === points.length - 1) return;

    const newPoints = points.filter((_, idx) => idx !== index);
    setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, curvesPoints: newPoints } : l));
    setSelectedPointIndex(null);
  };

  const handleOpenCropModal = () => {
    const selectedLayer = layers.find(l => l.id === selectedLayerId);
    if (!selectedLayer || selectedLayer.type !== 'image') return;
    const img = new Image();
    img.src = selectedLayer.originalImageUrl || selectedLayer.imageUrl || '';
    img.onload = () => {
      const origW = img.width;
      const origH = img.height;
      setCropImgDims({ width: origW, height: origH });
      
      const maxW = 400;
      const maxH = 280;
      let displayW = origW;
      let displayH = origH;
      const aspect = origW / origH;
      
      if (displayW > maxW) {
        displayW = maxW;
        displayH = maxW / aspect;
      }
      if (displayH > maxH) {
        displayH = maxH;
        displayW = maxH * aspect;
      }
      
      setCropDisplayDims({ width: displayW, height: displayH });
      
      const w80 = Math.round(displayW * 0.8);
      const h80 = Math.round(displayH * 0.8);
      const xStart = Math.round((displayW - w80) / 2);
      const yStart = Math.round((displayH - h80) / 2);

      setCropX(xStart);
      setCropY(yStart);
      setCropW(w80);
      setCropH(h80);
      setIsCropModalOpen(true);
    };
  };

  const handleApplyCrop = () => {
    const selectedLayer = layers.find(l => l.id === selectedLayerId);
    if (!selectedLayer || selectedLayer.type !== 'image') return;
    const img = new Image();
    img.src = selectedLayer.originalImageUrl || selectedLayer.imageUrl || '';
    img.onload = () => {
      const scaleX = img.width / cropDisplayDims.width;
      const scaleY = img.height / cropDisplayDims.height;
      
      const origX = cropX * scaleX;
      const origY = cropY * scaleY;
      const origW = cropW * scaleX;
      const origH = cropH * scaleY;

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = origW;
      tempCanvas.height = origH;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return;
      
      tempCtx.drawImage(
        img,
        origX,
        origY,
        origW,
        origH,
        0,
        0,
        origW,
        origH
      );
      
      const croppedBase64 = tempCanvas.toDataURL('image/png');
      saveHistory(layers);
      
      const newAspect = origW / origH;
      const newHeight = selectedLayer.width / newAspect;

      setLayers(prev => prev.map(l => {
        if (l.id === selectedLayer.id) {
          return {
            ...l,
            imageUrl: croppedBase64,
            originalImageUrl: l.originalImageUrl || l.imageUrl,
            height: newHeight,
          };
        }
        return l;
      }));

      setIsCropModalOpen(false);
    };
  };

  const handleCropBoxMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setCropDragMode('move');
    setCropDragStart({
      x: e.clientX,
      y: e.clientY,
      cropX,
      cropY,
      cropW,
      cropH
    });
  };

  const handleCropResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setCropDragMode('resize');
    setCropDragStart({
      x: e.clientX,
      y: e.clientY,
      cropX,
      cropY,
      cropW,
      cropH
    });
  };

  const handleCropMouseMove = (e: React.MouseEvent) => {
    if (!cropDragMode) return;
    e.preventDefault();
    
    const dx = e.clientX - cropDragStart.x;
    const dy = e.clientY - cropDragStart.y;

    if (cropDragMode === 'move') {
      let newX = cropDragStart.cropX + dx;
      let newY = cropDragStart.cropY + dy;
      
      newX = Math.max(0, Math.min(newX, cropDisplayDims.width - cropW));
      newY = Math.max(0, Math.min(newY, cropDisplayDims.height - cropH));
      
      setCropX(newX);
      setCropY(newY);
    } else if (cropDragMode === 'resize') {
      let newW = cropDragStart.cropW + dx;
      let newH = cropDragStart.cropH + dy;
      
      newW = Math.max(30, Math.min(newW, cropDisplayDims.width - cropX));
      newH = Math.max(30, Math.min(newH, cropDisplayDims.height - cropY));
      
      setCropW(newW);
      setCropH(newH);
    }
  };

  const handleCropMouseUp = () => {
    setCropDragMode(null);
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
                    {/* Filtros SVG para aplicar curvas a las imágenes del viewport en tiempo real */}
                    <svg style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }} aria-hidden="true">
                      <defs>
                        {layers.map(l => {
                          if (l.type === 'image' && l.curvesPoints && l.curvesPoints.length > 0) {
                            const tableVals = getSVGTableValues(l.curvesPoints);
                            return (
                              <filter id={`curves-${l.id}`} key={l.id} colorInterpolationFilters="sRGB">
                                <feComponentTransfer>
                                  <feFuncR type="table" tableValues={tableVals} />
                                  <feFuncG type="table" tableValues={tableVals} />
                                  <feFuncB type="table" tableValues={tableVals} />
                                </feComponentTransfer>
                              </filter>
                            );
                          }
                          return null;
                        })}
                      </defs>
                    </svg>

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
                                filter: `${layer.curvesPoints && layer.curvesPoints.length > 0 ? `url(#curves-${layer.id}) ` : ''}${adjustmentsToFilter(layer.adjustments)}`,
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
              {/* Sección 1: Añadir Capas */}
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

              {/* Sección 2: Lista de Capas */}
              <div className="sidebar-section">
                <span className="section-title">Capas ({layers.length})</span>
                {layers.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', padding: '15px' }}>
                    No hay capas en el lienzo.
                  </div>
                ) : (
                  <div className="layer-list" style={{ maxHeight: '180px', overflowY: 'auto' }}>
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
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', marginBottom: '4px', borderRadius: '6px', background: isActive ? 'var(--primary-glow)' : 'rgba(255,255,255,0.02)', cursor: 'pointer', border: isActive ? '1px solid var(--primary)' : '1px solid transparent' }}
                        >
                          <span style={{ fontSize: '13px', color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                            {layer.type === 'text' ? 'Texto: ' : 'Imagen: '}{layer.name}
                          </span>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              className="icon-btn danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteLayer(layer.id);
                              }}
                              title="Borrar capa"
                              style={{ padding: '4px' }}
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Sección 3: Propiedades de Capa Seleccionada O Fondo de Lienzo */}
              {selectedLayerId && selectedLayer ? (
                <div className="sidebar-section layer-properties-panel animate-fade-in">
                  <div className="layer-properties-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span className="section-title" style={{ color: 'var(--primary-hover)', margin: 0 }}>
                      Propiedades
                    </span>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '2px 8px', fontSize: '10px' }}
                      onClick={() => setSelectedLayerId(null)}
                    >
                      Deseleccionar
                    </button>
                  </div>
                  <LayerPropertiesPanel
                    layer={selectedLayer}
                    onUpdate={(updates) => {
                      setLayers((prev) =>
                        prev.map((l) => (l.id === selectedLayer.id ? { ...l, ...updates } : l))
                      );
                    }}
                    onOpenStyles={() => {
                      setBackupLayer(JSON.parse(JSON.stringify(selectedLayer)));
                      if (selectedLayer.type === 'image') {
                        setStylesActiveTab('adjustments');
                      } else {
                        setStylesActiveTab('fill');
                      }
                      setIsStylesModalOpen(true);
                    }}
                    onOpenCrop={handleOpenCropModal}
                  />
                </div>
              ) : (
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
                    <button className="btn btn-secondary" style={{ width: '100%', padding: '6px', fontSize: '12px', marginTop: '8px' }} onClick={handleClearBg}>
                      Hacer Transparente
                    </button>
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

      {/* ============================================================ */}
      {/* Modal de Estilos de Capa (Fx - Photoshop Style) */}
      {/* ============================================================ */}
      {isStylesModalOpen && selectedLayerId && (() => {
        const selectedLayer = layers.find(l => l.id === selectedLayerId);
        if (!selectedLayer) return null;
        return (
          <div className="modal-overlay-styles animate-fade-in" onClick={() => setIsStylesModalOpen(false)}>
            <div className="layer-styles-modal" onClick={(e) => e.stopPropagation()}>
              <div className="layer-styles-header">
                <h3>Estilos de Capa - {selectedLayer.name}</h3>
                <button className="icon-btn" onClick={() => setIsStylesModalOpen(false)} aria-label="Cerrar modal">×</button>
              </div>
              
              <div className="layer-styles-body">
                <div className="layer-styles-sidebar">
                  {selectedLayer.type === 'text' ? (
                    <>
                      <button
                        type="button"
                        className={`layer-styles-tab ${stylesActiveTab === 'fill' ? 'active' : ''}`}
                        onClick={() => setStylesActiveTab('fill')}
                      >
                        Relleno
                      </button>
                      <button
                        type="button"
                        className={`layer-styles-tab ${stylesActiveTab === 'stroke' ? 'active' : ''}`}
                        onClick={() => setStylesActiveTab('stroke')}
                      >
                        Trazo
                      </button>
                      <button
                        type="button"
                        className={`layer-styles-tab ${stylesActiveTab === 'background' ? 'active' : ''}`}
                        onClick={() => setStylesActiveTab('background')}
                      >
                        Fondo
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={`layer-styles-tab ${stylesActiveTab === 'adjustments' ? 'active' : ''}`}
                        onClick={() => setStylesActiveTab('adjustments')}
                      >
                        Ajustes
                      </button>
                      <button
                        type="button"
                        className={`layer-styles-tab ${stylesActiveTab === 'curves' ? 'active' : ''}`}
                        onClick={() => setStylesActiveTab('curves')}
                      >
                        Curvas
                      </button>
                      <button
                        type="button"
                        className={`layer-styles-tab ${stylesActiveTab === 'presets' ? 'active' : ''}`}
                        onClick={() => setStylesActiveTab('presets')}
                      >
                        Filtros
                      </button>
                    </>
                  )}
                </div>
                
                <div className="layer-styles-content">


                  {/* Controles de Texto - Relleno */}
                  {selectedLayer.type === 'text' && stylesActiveTab === 'fill' && (
                    <div className="form-group">
                      <label>Color de Letra</label>
                      <div className="color-input-wrapper" style={{ marginTop: '8px' }}>
                        <input
                          type="color"
                          value={selectedLayer.color || '#ffffff'}
                          onChange={(e) => {
                            setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, color: e.target.value } : l));
                          }}
                        />
                        <span>Relleno de texto</span>
                      </div>
                    </div>
                  )}

                  {/* Controles de Texto - Trazo */}
                  {selectedLayer.type === 'text' && stylesActiveTab === 'stroke' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      <div className="form-group">
                        <label>Color de Borde</label>
                        <div className="color-input-wrapper" style={{ marginTop: '8px' }}>
                          <input
                            type="color"
                            value={selectedLayer.borderColor || '#000000'}
                            onChange={(e) => {
                              setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, borderColor: e.target.value } : l));
                            }}
                          />
                          <span>Borde de texto</span>
                        </div>
                      </div>
                      <div className="form-group">
                        <label>Grosor del Borde</label>
                        <div className="range-control-group" style={{ marginTop: '8px' }}>
                          <input
                            type="range"
                            min="0"
                            max="20"
                            value={selectedLayer.borderWidth || 0}
                            onChange={(e) => {
                              setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, borderWidth: Number(e.target.value) } : l));
                            }}
                          />
                          <span>{selectedLayer.borderWidth || 0}px</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Controles de Texto - Fondo */}
                  {selectedLayer.type === 'text' && stylesActiveTab === 'background' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      <div className="form-group">
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={Boolean(selectedLayer.textBackgroundColor)}
                            onChange={(e) => {
                              setLayers(prev => prev.map(l => {
                                if (l.id === selectedLayerId) {
                                  if (e.target.checked) {
                                    return { ...l, textBackgroundColor: l.textBackgroundColor || '#000000' };
                                  } else {
                                    const { textBackgroundColor: _, ...rest } = l;
                                    return rest as Layer;
                                  }
                                }
                                return l;
                              }));
                            }}
                          />
                          Fondo del texto activo
                        </label>
                      </div>
                      {selectedLayer.textBackgroundColor && (
                        <div className="form-group">
                          <label>Color de Fondo</label>
                          <div className="color-input-wrapper" style={{ marginTop: '8px' }}>
                            <input
                              type="color"
                              value={selectedLayer.textBackgroundColor}
                              onChange={(e) => {
                                setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, textBackgroundColor: e.target.value } : l));
                              }}
                            />
                            <span>Fondo</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Controles de Imagen - Ajustes */}
                  {selectedLayer.type === 'image' && stylesActiveTab === 'adjustments' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {(
                        [
                          { key: 'brightness', label: 'Brillo', min: 0, max: 200, step: 1, unit: '%', defaultVal: 100 },
                          { key: 'contrast', label: 'Contraste', min: 0, max: 200, step: 1, unit: '%', defaultVal: 100 },
                          { key: 'saturation', label: 'Saturación', min: 0, max: 200, step: 1, unit: '%', defaultVal: 100 },
                          { key: 'hue', label: 'Tono', min: -180, max: 180, step: 1, unit: '°', defaultVal: 0 },
                          { key: 'invert', label: 'Invertir', min: 0, max: 100, step: 1, unit: '%', defaultVal: 0 },
                          { key: 'sepia', label: 'Sepia', min: 0, max: 100, step: 1, unit: '%', defaultVal: 0 },
                          {key: 'blur', label: 'Desenfoque', min: 0, max: 20, step: 0.5, unit: 'px', defaultVal: 0},
                        ] as const
                      ).map(({ key, label, min, max, step, unit, defaultVal }) => {
                        const value = selectedLayer.adjustments?.[key] ?? defaultVal;
                        return (
                          <div key={key} className="form-group" style={{ marginBottom: '6px' }}>
                            <div className="range-control-group">
                              <input
                                type="range"
                                min={min}
                                max={max}
                                step={step}
                                value={value}
                                onChange={(e) => {
                                  const next = { ...(selectedLayer.adjustments ?? defaultAdjustments()), [key]: Number(e.target.value) };
                                  setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, adjustments: next } : l));
                                }}
                              />
                              <span style={{ minWidth: 36, textAlign: 'right' }}>{value}{unit}</span>
                            </div>
                            <label style={{ fontSize: '11px', marginTop: '2px' }}>{label}</label>
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ width: '100%', padding: '6px', fontSize: '11px', marginTop: '4px' }}
                        onClick={() => {
                          setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, adjustments: defaultAdjustments() } : l));
                        }}
                      >
                        Restablecer ajustes
                      </button>
                    </div>
                  )}

                  {/* Controles de Imagen - Curvas (Photoshop style Curves Editor) */}
                  {selectedLayer.type === 'image' && stylesActiveTab === 'curves' && (() => {
                    const points = selectedLayer.curvesPoints || [[0, 0], [255, 255]];
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <label style={{ fontWeight: 600 }}>Curvas de Color</label>
                        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                          {/* El SVG del editor de curvas */}
                          <svg
                            width="200"
                            height="200"
                            style={{
                              background: 'var(--bg-panel)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '8px',
                              overflow: 'visible',
                              cursor: 'crosshair',
                              userSelect: 'none'
                            }}
                            onMouseDown={handleCurvesSVGMouseDown}
                            onMouseMove={handleCurvesSVGMouseMove}
                            onMouseUp={handleCurvesSVGMouseUp}
                            onMouseLeave={handleCurvesSVGMouseUp}
                          >
                            {/* Cuadrículas de referencia (Photoshop style) */}
                            <line x1="50" y1="0" x2="50" y2="200" stroke="rgba(255,255,255,0.07)" strokeDasharray="3 3" />
                            <line x1="100" y1="0" x2="100" y2="200" stroke="rgba(255,255,255,0.07)" strokeDasharray="3 3" />
                            <line x1="150" y1="0" x2="150" y2="200" stroke="rgba(255,255,255,0.07)" strokeDasharray="3 3" />
                            
                            <line x1="0" y1="50" x2="200" y2="50" stroke="rgba(255,255,255,0.07)" strokeDasharray="3 3" />
                            <line x1="0" y1="100" x2="200" y2="100" stroke="rgba(255,255,255,0.07)" strokeDasharray="3 3" />
                            <line x1="0" y1="150" x2="200" y2="150" stroke="rgba(255,255,255,0.07)" strokeDasharray="3 3" />

                            {/* Diagonal por defecto */}
                            <line x1="0" y1="200" x2="200" y2="0" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />

                            {/* Línea curva conectando los puntos interpolados */}
                            {(() => {
                              const svgPointsStr = points
                                .map((p) => {
                                  const svgX = (p[0] / 255) * 200;
                                  const svgY = (1 - p[1] / 255) * 200;
                                  return `${svgX},${svgY}`;
                                })
                                .join(' ');
                              return (
                                <polyline
                                  points={svgPointsStr}
                                  fill="none"
                                  stroke="var(--primary)"
                                  strokeWidth="2.5"
                                />
                              );
                            })()}

                            {/* Círculos para los puntos de control */}
                            {points.map((p, idx) => {
                              const svgX = (p[0] / 255) * 200;
                              const svgY = (1 - p[1] / 255) * 200;
                              const isEndpoint = idx === 0 || idx === points.length - 1;
                              return (
                                <circle
                                  key={idx}
                                  cx={svgX}
                                  cy={svgY}
                                  r={idx === selectedPointIndex ? 6 : 4.5}
                                  fill={idx === selectedPointIndex ? 'var(--primary-hover)' : 'var(--primary)'}
                                  stroke="#fff"
                                  strokeWidth="1.5"
                                  style={{ cursor: isEndpoint ? 'ns-resize' : 'move' }}
                                  onDoubleClick={(e) => handleCurvesDoubleClickPoint(idx, e)}
                                />
                              );
                            })}
                          </svg>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                            <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>Curvas:</span>
                            <span>• Haz clic para añadir puntos.</span>
                            <span>• Arrastra para deformar los colores.</span>
                            <span>• Doble clic para borrar puntos.</span>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '6px', fontSize: '11px', marginTop: '10px' }}
                              onClick={() => {
                                setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, curvesPoints: [[0, 0], [255, 255]] } : l));
                              }}
                            >
                              Restablecer curva
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Controles de Imagen - Filtros */}
                  {selectedLayer.type === 'image' && stylesActiveTab === 'presets' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      <label>Filtros Rápidos</label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                        {(
                          [
                            { label: 'Blanco y negro', apply: { saturation: 0 } },
                            { label: 'Sepia', apply: { sepia: 80 } },
                            { label: 'Frío', apply: { hue: -15, saturation: 110 } },
                            { label: 'Cálido', apply: { hue: 15, saturation: 110 } },
                            { label: 'Alto contraste', apply: { contrast: 140, saturation: 120 } },
                            { label: 'Invertir', apply: { invert: 100 } },
                          ] as const
                        ).map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            className="layer-preset-btn"
                            style={{ padding: '10px' }}
                            onClick={() => {
                              const next = { ...defaultAdjustments(), ...preset.apply };
                              setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, adjustments: next } : l));
                            }}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="layer-styles-footer" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', boxSizing: 'border-box' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    saveHistory(layers);
                    setLayers(prev => prev.map(l => {
                      if (l.id === selectedLayerId) {
                        if (l.type === 'image') {
                          return {
                            ...l,
                            adjustments: defaultAdjustments(),
                            curvesPoints: [[0, 0], [255, 255]]
                          };
                        } else {
                          return {
                            ...l,
                            color: '#ffffff',
                            borderColor: '#000000',
                            borderWidth: 0,
                            textBackgroundColor: undefined
                          };
                        }
                      }
                      return l;
                    }));
                  }}
                >
                  Restablecer
                </button>
                
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      if (backupLayer) {
                        setLayers(prev => prev.map(l => l.id === backupLayer.id ? backupLayer : l));
                      }
                      setIsStylesModalOpen(false);
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-accent"
                    onClick={() => setIsStylesModalOpen(false)}
                  >
                    Aceptar
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ============================================================ */}
      {/* Modal de Recorte de Imagen (Crop Modal) */}
      {/* ============================================================ */}
      {isCropModalOpen && selectedLayerId && (() => {
        const selectedLayer = layers.find(l => l.id === selectedLayerId);
        if (!selectedLayer) return null;
        return (
          <div className="modal-overlay animate-fade-in" onClick={() => setIsCropModalOpen(false)}>
            <div className="layer-styles-modal" style={{ maxWidth: '500px', height: 'auto' }} onClick={(e) => e.stopPropagation()}>
              <div className="layer-styles-header">
                <h3>Recortar Imagen</h3>
                <button className="icon-btn" onClick={() => setIsCropModalOpen(false)}>×</button>
              </div>
              
              <div className="layer-styles-content" style={{ gap: '15px', alignItems: 'center' }}>
                <div 
                  className="crop-container"
                  style={{
                    position: 'relative',
                    width: `${cropDisplayDims.width}px`,
                    height: `${cropDisplayDims.height}px`,
                    background: '#000',
                    userSelect: 'none',
                    overflow: 'hidden',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)'
                  }}
                  onMouseMove={handleCropMouseMove}
                  onMouseUp={handleCropMouseUp}
                  onMouseLeave={handleCropMouseUp}
                >
                  {/* Imagen base opacada */}
                  <img
                    src={selectedLayer.originalImageUrl || selectedLayer.imageUrl}
                    alt="Recortar"
                    style={{
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'none',
                      userSelect: 'none',
                      opacity: 0.35
                    }}
                  />

                  {/* Caja de selección de recorte */}
                  <div
                    style={{
                      position: 'absolute',
                      left: `${cropX}px`,
                      top: `${cropY}px`,
                      width: `${cropW}px`,
                      height: `${cropH}px`,
                      border: '2px dashed var(--primary)',
                      boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
                      cursor: 'move',
                      boxSizing: 'border-box'
                    }}
                    onMouseDown={handleCropBoxMouseDown}
                  >
                    {/* Imagen recortada brillante de preview */}
                    <div style={{
                      width: '100%',
                      height: '100%',
                      overflow: 'hidden',
                      position: 'relative'
                    }}>
                      <img
                        src={selectedLayer.originalImageUrl || selectedLayer.imageUrl}
                        alt="Crop preview"
                        style={{
                          position: 'absolute',
                          left: `-${cropX}px`,
                          top: `-${cropY}px`,
                          width: `${cropDisplayDims.width}px`,
                          height: `${cropDisplayDims.height}px`,
                          pointerEvents: 'none',
                          maxWidth: 'none'
                        }}
                      />
                    </div>

                    {/* Tirador de cambio de tamaño en la esquina inferior derecha */}
                    <div
                      style={{
                        position: 'absolute',
                        right: '-5px',
                        bottom: '-5px',
                        width: '10px',
                        height: '10px',
                        background: 'var(--primary)',
                        border: '2px solid #fff',
                        borderRadius: '50%',
                        cursor: 'se-resize',
                        zIndex: 10
                      }}
                      onMouseDown={handleCropResizeMouseDown}
                    />
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '5px' }}>
                  Arrastra la caja para moverla, usa el tirador de la esquina inferior derecha para cambiar el tamaño
                </div>
              </div>

              <div className="layer-styles-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsCropModalOpen(false)}>Cancelar</button>
                <button type="button" className="btn btn-accent" onClick={handleApplyCrop}>Aplicar Recorte</button>
              </div>
            </div>
          </div>
        );
      })()}
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

/* ------------------------------------------------------------------ */
/* LayerPropertiesPanel — panel de propiedades reusable. Se renderiza  */
/* inline debajo de cada capa cuando se expande con la flecha, y      */
/* también en la barra lateral para la capa seleccionada.              */
/* ------------------------------------------------------------------ */

interface LayerPropertiesPanelProps {
  layer: Layer;
  onUpdate: (updates: Partial<Layer>) => void;
  onOpenStyles: () => void;
  onOpenCrop: () => void;
}

function LayerPropertiesPanel({ layer, onUpdate, onOpenStyles, onOpenCrop }: LayerPropertiesPanelProps) {
  return (
    <div className="layer-properties animate-fade-in">
      {layer.type === 'text' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="form-group">
            <label>Contenido del Texto</label>
            <textarea
              rows={3}
              value={layer.text || ''}
              onChange={(e) => onUpdate({ text: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>Tipografía</label>
            <select
              value={layer.fontFamily || 'Impact'}
              onChange={(e) => onUpdate({ fontFamily: e.target.value })}
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
                value={layer.fontSize || 40}
                onChange={(e) => onUpdate({ fontSize: Number(e.target.value) })}
              />
              <span>{layer.fontSize}px</span>
            </div>
          </div>

          {/* Botón Estilos de Capa (FX) */}
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              onClick={onOpenStyles}
            >
              Estilos de Capa (Colores, Bordes...)
            </button>
          </div>
        </div>
      )}

      {layer.type === 'image' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <p>Tipo: Imagen</p>
          <p>Dimensiones: {Math.round(layer.width)}x{Math.round(layer.height)} px</p>
          <p>Rotación: {Math.round(layer.rotation)}°</p>
          <div className="form-group" style={{ marginTop: '10px' }}>
            <label>Cambiar Tamaño Ancho</label>
            <input
              type="number"
              value={Math.round(layer.width)}
              onChange={(e) => {
                const w = Math.max(10, Number(e.target.value));
                const aspect = layer.width / layer.height;
                onUpdate({ width: w, height: w / aspect });
              }}
            />
          </div>

          {/* Botones de Estilos y Recorte de Imagen */}
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              onClick={onOpenStyles}
            >
              Ajustes de Color de la Imagen
            </button>
            
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              onClick={onOpenCrop}
            >
              Recortar Imagen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
