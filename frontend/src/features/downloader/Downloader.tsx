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

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { cn } from "@/lib/utils"

type DownloadFormat = "Video" | "Audio"

interface DownloaderProps {
  apiUrl: string
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

export function Downloader({ apiUrl }: DownloaderProps) {
  const [ytUrl, setYtUrl] = useState<string>("")
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
      setDownloadError("Por favor, ingresa una URL v├ílida.")
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
        throw new Error(errorData.detail || "El servidor fall├│ durante la descarga.")
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
        // User cancelled ÔÇö no error to show
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
    <div className="w-full max-w-5xl mx-auto p-6 sm:p-10 animate-fade-in">
      <Card>
        <CardHeader className="pb-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5">
              <Download className="size-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl">SAS Downloader</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Descarga videos y audio de YouTube en alta calidad
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 p-6 sm:p-10 pt-0">
          {/* URL Tile */}
          <div className="rounded-xl border border-border bg-muted/30 p-5 sm:p-6 space-y-4">
            <Label htmlFor="yt-url" className="text-xs uppercase tracking-wider text-muted-foreground">
              URL del video
            </Label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 size-5 text-muted-foreground pointer-events-none" />
                <Input
                  id="yt-url"
                  type="text"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={ytUrl}
                  onChange={(e) => setYtUrl(e.target.value)}
                  disabled={isBusy}
                  className="h-12 pl-11 text-base"
                />
              </div>
              <Button
                variant="secondary"
                onClick={handleFetchFormats}
                disabled={isBusy || !ytUrl.trim()}
                className="h-12 px-5"
              >
                {isFetchingFormats ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Cargando
                  </>
                ) : (
                  <>
                    <Sparkles />
                    Cargar resoluciones
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Format + Quality Tile (2 columns) */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-muted/30 p-5 sm:p-6 space-y-4">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Formato de descarga
              </Label>
              <div className="grid grid-cols-2 gap-2">
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
                        "flex flex-col items-start gap-1.5 rounded-lg border-2 p-3 text-left transition-all",
                        "hover:border-primary/50 hover:bg-primary/5",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card"
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-5",
                          isSelected ? "text-primary" : "text-muted-foreground"
                        )}
                      />
                      <span className="text-sm font-semibold">{opt.label}</span>
                      <span className="text-xs text-muted-foreground">{opt.sublabel}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-5 sm:p-6 space-y-4">
              <Label
                htmlFor="quality"
                className="text-xs uppercase tracking-wider text-muted-foreground"
              >
                Calidad
              </Label>
              <Select
                id="quality"
                value={downloadQuality}
                onChange={(e) => setDownloadQuality(e.target.value)}
                disabled={isDownloading || downloadFormat !== "Video"}
                className="h-12 text-base"
              >
                {formats.length > 0 ? (
                  formats.map((fmt) => (
                    <option key={fmt} value={fmt}>
                      {fmt}
                    </option>
                  ))
                ) : (
                  <option value="Mejor calidad disponible">
                    Mejor calidad disponible
                  </option>
                )}
              </Select>
            </div>
          </div>

          {/* Filename Tile */}
          <div className="rounded-xl border border-border bg-muted/30 p-5 sm:p-6 space-y-4">
            <Label
              htmlFor="custom-name"
              className="text-xs uppercase tracking-wider text-muted-foreground"
            >
              Nombre del archivo <span className="text-muted-foreground/60">(opcional)</span>
            </Label>
            <div className="relative">
              <FileText className="absolute left-3.5 top-1/2 -translate-y-1/2 size-5 text-muted-foreground pointer-events-none" />
              <Input
                id="custom-name"
                type="text"
                placeholder="ej: video-epico (se usará el título original si lo omites)"
                value={customFileName}
                onChange={(e) => setCustomFileName(e.target.value)}
                disabled={isDownloading}
                className="h-12 pl-11 text-base"
              />
            </div>
          </div>

          {/* Error */}
          {downloadError && (
            <Alert variant="destructive">
              <AlertCircle className="size-5" />
              <AlertDescription className="text-base">{downloadError}</AlertDescription>
            </Alert>
          )}

          {/* Status Tile */}
          {isBusy ? (
            <div className="rounded-xl border border-primary/30 bg-primary/10 p-5 sm:p-6 flex items-center gap-3">
              <Loader2 className="size-5 animate-spin text-primary" />
              <span className="text-base font-medium text-primary">
                {isDownloading ? downloadStatus : "Buscando formatos disponibles..."}
              </span>
            </div>
          ) : hasUrl ? (
            <div className="rounded-xl border border-[color:var(--success)]/30 bg-[color:var(--success)]/10 p-5 sm:p-6 flex items-center gap-3">
              <CheckCircle2 className="size-5 text-[color:var(--success)]" />
              <span className="text-base font-semibold text-[color:var(--success)]">
                ¡Listo para descargar!
              </span>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-muted/30 p-5 sm:p-6 flex items-center gap-3">
              <Link2 className="size-5 text-muted-foreground" />
              <span className="text-base text-muted-foreground">
                Pega una URL de YouTube para comenzar.
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              onClick={handleDownload}
              disabled={isBusy || !ytUrl.trim()}
              className="flex-[3] h-14 text-base font-semibold"
              size="lg"
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
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelDownload}
              disabled={!isDownloading}
              className="flex-1 h-14"
            >
              <X className="size-5" />
              Cancelar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
