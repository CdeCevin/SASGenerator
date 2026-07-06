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
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 md:p-8 animate-fade-in flex justify-center">
      {/* Contenedor Principal (Tarjeta) */}
      <div className="w-full border border-border bg-card rounded-xl text-card-foreground shadow-lg flex flex-col overflow-hidden">
        {/* Cabecera */}
        <div className="p-6 border-b border-border/50 flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5">
            <Download className="size-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">SAS Downloader</h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Descarga videos y audio de YouTube en alta calidad
            </p>
          </div>
        </div>

        {/* Formulario */}
        <div className="p-6 sm:p-8 flex flex-col gap-6">
          {/* URL Input Row */}
          <div className="flex flex-col gap-2">
            <label htmlFor="yt-url" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              URL del video
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 size-5 text-muted-foreground pointer-events-none" />
                <input
                  id="yt-url"
                  type="text"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={ytUrl}
                  onChange={(e) => setYtUrl(e.target.value)}
                  disabled={isBusy}
                  className="h-12 pl-11 pr-4 py-2 w-full rounded-lg border border-border bg-muted/40 text-base text-foreground placeholder:text-muted-foreground transition-colors focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <button
                type="button"
                onClick={handleFetchFormats}
                disabled={isBusy || !ytUrl.trim()}
                className="h-12 px-5 font-semibold text-sm bg-muted border border-border hover:bg-muted/80 text-foreground rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Format Selection (col-span-2) */}
            <div className="md:col-span-2 flex flex-col gap-2">
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Formato de descarga
              </label>
              <div className="grid grid-cols-2 gap-3">
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
                        "flex items-center gap-3.5 rounded-lg border p-3 text-left transition-all h-14 cursor-pointer",
                        "hover:border-primary/50 hover:bg-primary/5",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        isSelected
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-muted/40 text-muted-foreground"
                      )}
                    >
                      <div className={cn(
                        "p-1.5 rounded-md shrink-0",
                        isSelected ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                      )}>
                        <Icon className="size-5" />
                      </div>
                      <div className="flex flex-col leading-tight">
                        <span className="text-sm font-bold text-foreground">{opt.label}</span>
                        <span className="text-xs text-muted-foreground">{opt.sublabel}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Quality Select (col-span-1) */}
            <div className="flex flex-col gap-2">
              <label
                htmlFor="quality"
                className="text-xs uppercase tracking-wider text-muted-foreground font-semibold"
              >
                Calidad
              </label>
              <select
                id="quality"
                value={downloadQuality}
                onChange={(e) => setDownloadQuality(e.target.value)}
                disabled={isDownloading || downloadFormat !== "Video"}
                className="h-14 w-full items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 text-base text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
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
          <div className="flex flex-col gap-2">
            <label
              htmlFor="custom-name"
              className="text-xs uppercase tracking-wider text-muted-foreground font-semibold"
            >
              Nombre del archivo <span className="text-muted-foreground/60">(opcional)</span>
            </label>
            <div className="relative">
              <FileText className="absolute left-3.5 top-1/2 -translate-y-1/2 size-5 text-muted-foreground pointer-events-none" />
              <input
                id="custom-name"
                type="text"
                placeholder="ej: video-epico (se usará el título original si lo omites)"
                value={customFileName}
                onChange={(e) => setCustomFileName(e.target.value)}
                disabled={isDownloading}
                className="h-12 pl-11 pr-4 py-2 w-full rounded-lg border border-border bg-muted/40 text-base text-foreground placeholder:text-muted-foreground transition-colors focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
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
            <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 flex items-center gap-3 animate-pulse">
              <Loader2 className="size-5 animate-spin text-primary shrink-0" />
              <span className="text-sm sm:text-base font-medium text-primary">
                {isDownloading ? downloadStatus : "Buscando formatos disponibles..."}
              </span>
            </div>
          ) : hasUrl ? (
            <div className="rounded-xl border border-[color:var(--success)]/30 bg-[color:var(--success)]/10 p-4 flex items-center gap-3">
              <CheckCircle2 className="size-5 text-[color:var(--success)] shrink-0" />
              <span className="text-sm sm:text-base font-semibold text-[color:var(--success)]">
                ¡Listo para descargar!
              </span>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-muted/20 p-4 flex items-center gap-3">
              <Link2 className="size-5 text-muted-foreground shrink-0" />
              <span className="text-sm sm:text-base text-muted-foreground">
                Pega una URL de YouTube para comenzar.
              </span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={isBusy || !ytUrl.trim()}
              className="flex-[3] h-14 text-base font-bold bg-primary hover:bg-[color:var(--primary-hover)] text-primary-foreground shadow-lg shadow-primary/20 rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="flex-1 h-14 border border-destructive/30 bg-destructive/10 hover:bg-destructive/20 text-destructive-foreground font-semibold rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-colors"
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
