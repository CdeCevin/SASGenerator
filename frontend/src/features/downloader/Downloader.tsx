import { useRef, useState } from "react"
import {
  Download,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  Link2,
  Video,
  Music2,
  FileText,
  Sparkles,
} from "lucide-react"

import { cn } from "@/lib/utils"

type DownloadFormat = "Video" | "Audio"

interface DownloaderProps {
  apiUrl: string
  formUrl: string
  onFormUrlChange: (url: string) => void
}

interface FormatOption {
  value: DownloadFormat
  label: string
  sublabel: string
  icon: typeof Video
}

const FORMAT_OPTIONS: FormatOption[] = [
  { value: "Video", label: "Video", sublabel: "MP4", icon: Video },
  { value: "Audio", label: "Solo Audio", sublabel: "MP3", icon: Music2 },
]

export function Downloader({ apiUrl, formUrl, onFormUrlChange }: DownloaderProps) {
  const ytUrl = formUrl
  const setYtUrl = onFormUrlChange
  const [isFetchingFormats, setIsFetchingFormats] = useState<boolean>(false)
  const [formats, setFormats] = useState<string[]>([])
  const [downloadFormat, setDownloadFormat] = useState<DownloadFormat>("Video")
  const [downloadQuality, setDownloadQuality] = useState<string>("Mejor calidad disponible")
  const [customFileName, setCustomFileName] = useState<string>("")
  const [isDownloading, setIsDownloading] = useState<boolean>(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [downloadStatus, setDownloadStatus] = useState<string>("")
  const abortControllerRef = useRef<AbortController | null>(null)

  const handleFetchFormats = async () => {
    if (!ytUrl.trim()) {
      setDownloadError("Por favor, ingresa una URL válida.")
      return
    }

    if (!apiUrl) {
      setDownloadError(
        "Configura la variable de entorno VITE_DOWNLOADER_API_URL para el servidor de descargas."
      )
      return
    }

    setIsFetchingFormats(true)
    setDownloadError(null)
    setFormats([])

    try {
      const cleanApiUrl = apiUrl.replace(/\/$/, "")
      const response = await fetch(
        `${cleanApiUrl}/fetch-formats?url=${encodeURIComponent(ytUrl)}`
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || "Error al conectar con el servidor de descargas.")
      }

      const data = await response.json()
      setFormats(data.formats || ["Mejor calidad disponible"])
      setDownloadQuality("Mejor calidad disponible")
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error
          ? err.message
          : "Error al buscar formatos en el servidor."
      setDownloadError(errMsg)
    } finally {
      setIsFetchingFormats(false)
    }
  }

  const handleDownload = async () => {
    if (!ytUrl.trim()) return

    if (!apiUrl) {
      setDownloadError(
        "Configura la variable de entorno VITE_DOWNLOADER_API_URL para el servidor de descargas."
      )
      return
    }

    setIsDownloading(true)
    setDownloadError(null)
    setDownloadStatus("Conectando con el servidor...")

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const cleanApiUrl = apiUrl.replace(/\/$/, "")
      const downloadEndpoint =
        `${cleanApiUrl}/download?url=${encodeURIComponent(ytUrl)}` +
        `&format_type=${downloadFormat}` +
        `&quality=${encodeURIComponent(downloadQuality)}` +
        `&custom_name=${encodeURIComponent(customFileName)}`

      setDownloadStatus("Descargando y convirtiendo en el servidor...")

      const response = await fetch(downloadEndpoint, { signal: controller.signal })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || "El servidor falló durante la descarga.")
      }

      setDownloadStatus("Recibiendo archivo en tu navegador...")

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url

      const disposition = response.headers.get("content-disposition")
      let filename = customFileName.trim() ? customFileName.trim() : "descarga"
      const extension = downloadFormat === "Video" ? ".mp4" : ".mp3"

      if (disposition && disposition.indexOf("filename=") !== -1) {
        const matches = /filename="?([^";]+)"?/g.exec(disposition)
        if (matches != null && matches[1]) {
          filename = matches[1]
        } else {
          filename = filename + extension
        }
      } else {
        filename = filename + extension
      }

      a.download = filename
      document.body.appendChild(a)
      a.click()

      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        // User cancelled — no error to show
      } else {
        const errMsg =
          err instanceof Error ? err.message : "Error al procesar la descarga."
        setDownloadError(errMsg)
      }
    } finally {
      setIsDownloading(false)
      setDownloadStatus("")
      abortControllerRef.current = null
    }
  }

  const handleCancelDownload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }

  const isBusy = isDownloading || isFetchingFormats
  const hasUrl = ytUrl.trim().length > 0

  return (
    <div className="downloader-wrapper animate-fade-in">
      {/* Contenedor Principal (Tarjeta) */}
      <div className="downloader-card">
        {/* Cabecera */}
        <div className="downloader-header">
          <div className="downloader-format-icon-box" style={{ background: 'rgba(124, 108, 246, 0.1)', color: 'var(--primary)', padding: '10px' }}>
            <Download className="size-6" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground" style={{ fontFamily: 'Outfit, sans-serif' }}>SAS Downloader</h2>
            <p className="text-xs sm:text-sm text-muted-foreground" style={{ marginTop: '4px' }}>
              Descarga videos y audio de YouTube en alta calidad
            </p>
          </div>
        </div>

        {/* Formulario */}
        <div className="downloader-form">
          {/* URL Input Row */}
          <div className="downloader-field-group">
            <label htmlFor="yt-url">
              URL del video
            </label>
            <div className="downloader-input-row">
              <div className="downloader-input-wrapper">
                <Link2 className="downloader-input-icon" />
                <input
                  id="yt-url"
                  type="text"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={ytUrl}
                  onChange={(e) => setYtUrl(e.target.value)}
                  disabled={isBusy}
                  className="downloader-text-input"
                />
              </div>
              <button
                type="button"
                onClick={handleFetchFormats}
                disabled={isBusy || !ytUrl.trim()}
                className="downloader-btn-fetch"
              >
                {isFetchingFormats ? (
                  <>
                    <Loader2 className="animate-spin size-4" />
                    Cargando...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    Cargar resoluciones
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Format and Quality Row */}
          <div className="downloader-grid-formats">
            {/* Format Selection */}
            <div className="downloader-field-group">
              <label>
                Formato de descarga
              </label>
              <div className="downloader-formats-subgrid">
                {FORMAT_OPTIONS.map((opt) => {
                  const Icon = opt.icon
                  const isSelected = downloadFormat === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDownloadFormat(opt.value)}
                      disabled={isDownloading}
                      className={cn(
                        "downloader-format-btn",
                        isSelected && "active"
                      )}
                    >
                      <div className="downloader-format-icon-box">
                        <Icon className="size-5" />
                      </div>
                      <div className="downloader-format-text-box">
                        <span className="title">{opt.label}</span>
                        <span className="subtitle">{opt.sublabel}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Quality Select */}
            <div className="downloader-field-group">
              <label htmlFor="quality">
                Calidad
              </label>
              <select
                id="quality"
                value={downloadQuality}
                onChange={(e) => setDownloadQuality(e.target.value)}
                disabled={isDownloading || downloadFormat !== "Video"}
                className="downloader-select"
              >
                {formats.length > 0 ? (
                  formats.map((fmt) => (
                    <option key={fmt} value={fmt} className="bg-card">
                      {fmt}
                    </option>
                  ))
                ) : (
                  <option value="Mejor calidad disponible" className="bg-card">
                    Mejor calidad disponible
                  </option>
                )}
              </select>
            </div>
          </div>

          {/* Filename Input */}
          <div className="downloader-field-group">
            <label htmlFor="custom-name">
              Nombre del archivo <span style={{ textTransform: 'lowercase', opacity: 0.6 }}>(opcional)</span>
            </label>
            <div className="downloader-input-wrapper">
              <FileText className="downloader-input-icon" />
              <input
                id="custom-name"
                type="text"
                placeholder="ej: video-epico (se usará el título original si lo omites)"
                value={customFileName}
                onChange={(e) => setCustomFileName(e.target.value)}
                disabled={isDownloading}
                className="downloader-text-input"
              />
            </div>
          </div>

          {/* Error Alert */}
          {downloadError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 text-destructive-foreground p-4 flex items-center gap-3">
              <AlertCircle className="size-5 shrink-0" />
              <span className="text-sm sm:text-base font-medium">{downloadError}</span>
            </div>
          )}

          {/* Status Box */}
          {isBusy ? (
            <div className="downloader-status-box busy animate-pulse">
              <Loader2 className="size-5 animate-spin shrink-0" />
              <span className="font-medium">
                {isDownloading ? downloadStatus : "Buscando formatos disponibles..."}
              </span>
            </div>
          ) : hasUrl ? (
            <div className="downloader-status-box ready">
              <CheckCircle2 className="size-5 shrink-0" />
              <span className="font-semibold">
                ¡Listo para descargar!
              </span>
            </div>
          ) : (
            <div className="downloader-status-box empty">
              <Link2 className="size-5 shrink-0" />
              <span>
                Pega una URL de YouTube para comenzar.
              </span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="downloader-action-row">
            <button
              type="button"
              onClick={handleDownload}
              disabled={isBusy || !ytUrl.trim()}
              className="downloader-btn-download"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="size-5 animate-spin" />
                  PROCESANDO...
                </>
              ) : (
                <>
                  <Download className="size-5" />
                  Iniciar descarga
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleCancelDownload}
              disabled={!isDownloading}
              className="downloader-btn-cancel"
            >
              <X className="size-5" />
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
