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
  Search,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
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
  { value: "Audio", label: "Solo audio", sublabel: "MP3", icon: Music2 },
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

      setDownloadStatus("Convirtiendo en el servidor...")

      const response = await fetch(downloadEndpoint, { signal: controller.signal })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || "El servidor falló durante la descarga.")
      }

      setDownloadStatus("Recibiendo el archivo...")

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
    <div className="w-full max-w-3xl mx-auto p-4 sm:p-6 animate-fade-in">
      <Card className="shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]">
        <CardContent className="p-6 sm:p-8 space-y-5">
          {/* Header — the signature: serif italic title vs sans subtitle */}
          <header className="space-y-1.5 pb-1">
            <h1
              className="text-3xl sm:text-4xl tracking-tight text-foreground"
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                fontWeight: 400,
                lineHeight: 1.1,
              }}
            >
              SAS Downloader
            </h1>
            <p className="text-sm text-muted-foreground">
              Pega una URL de YouTube y descárgala en el formato que necesites.
            </p>
          </header>

          {/* URL Tile */}
          <Tile
            label="URL del video"
            htmlFor="yt-url"
            help={
              hasUrl
                ? undefined
                : "Acepta enlaces de youtube.com o youtu.be."
            }
          >
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Link2
                  className={cn(
                    "absolute left-3.5 top-1/2 -translate-y-1/2 size-5 transition-colors pointer-events-none",
                    hasUrl ? "text-foreground/60" : "text-muted-foreground/60"
                  )}
                  aria-hidden
                />
                <Input
                  id="yt-url"
                  type="text"
                  inputMode="url"
                  placeholder="https://www.youtube.com/watch?v=…"
                  value={ytUrl}
                  onChange={(e) => setYtUrl(e.target.value)}
                  disabled={isBusy}
                  className="h-12 pl-11 text-base"
                  aria-label="URL del video de YouTube"
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
                    Buscando
                  </>
                ) : (
                  <>
                    <Search />
                    Buscar formatos
                  </>
                )}
              </Button>
            </div>
          </Tile>

          {/* Format + Quality (2 columns) */}
          <div className="grid sm:grid-cols-2 gap-3">
            <Tile label="Formato">
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
                      aria-pressed={isSelected}
                      className={cn(
                        "flex flex-col items-start gap-1.5 rounded-lg border-2 p-3 text-left transition-colors duration-150",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card hover:border-foreground/30"
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-5",
                          isSelected
                            ? "text-primary"
                            : "text-muted-foreground"
                        )}
                        aria-hidden
                      />
                      <span className="text-sm font-semibold leading-none">
                        {opt.label}
                      </span>
                      <span className="text-xs text-muted-foreground leading-none">
                        {opt.sublabel}
                      </span>
                    </button>
                  )
                })}
              </div>
            </Tile>

            <Tile label="Calidad" htmlFor="quality">
              <Select
                id="quality"
                value={downloadQuality}
                onChange={(e) => setDownloadQuality(e.target.value)}
                disabled={isDownloading || downloadFormat !== "Video"}
                className="h-12 text-base"
                aria-label="Calidad del video"
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
            </Tile>
          </div>

          {/* Filename Tile */}
          <Tile label="Nombre del archivo" htmlFor="custom-name">
            <div className="relative">
              <FileText
                className="absolute left-3.5 top-1/2 -translate-y-1/2 size-5 text-muted-foreground/60 pointer-events-none"
                aria-hidden
              />
              <Input
                id="custom-name"
                type="text"
                placeholder="Si lo dejas vacío, se usará el título del video."
                value={customFileName}
                onChange={(e) => setCustomFileName(e.target.value)}
                disabled={isDownloading}
                className="h-12 pl-11 text-base"
                aria-label="Nombre personalizado del archivo"
              />
            </div>
          </Tile>

          {/* Error */}
          {downloadError && (
            <Alert variant="destructive">
              <AlertCircle className="size-5" />
              <AlertDescription className="text-base">
                {downloadError}
              </AlertDescription>
            </Alert>
          )}

          {/* Status Tile — the state indicator, not a CTA */}
          {isBusy ? (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex items-center gap-3">
              <Loader2
                className="size-5 animate-spin text-primary"
                aria-hidden
              />
              <span className="text-sm font-medium text-foreground">
                {isDownloading ? downloadStatus : "Buscando formatos disponibles…"}
              </span>
            </div>
          ) : hasUrl ? (
            <div className="rounded-lg border border-[color:var(--success)]/25 bg-[color:var(--success)]/10 p-4 flex items-center gap-3">
              <CheckCircle2
                className="size-5 text-[color:var(--success)]"
                aria-hidden
              />
              <span className="text-sm font-medium text-foreground">
                Formato detectado. Pulsa iniciar descarga.
              </span>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-4 flex items-center gap-3">
              <Link2
                className="size-5 text-muted-foreground/60"
                aria-hidden
              />
              <span className="text-sm text-muted-foreground">
                Pega una URL de YouTube arriba para empezar.
              </span>
            </div>
          )}

          {/* Actions — neutral high-contrast, the violet signature is reserved for the format tile */}
          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
            <Button
              onClick={handleDownload}
              disabled={isBusy || !ytUrl.trim()}
              size="lg"
              className="flex-1 h-12 bg-foreground text-background hover:bg-foreground/90 font-semibold"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="size-5 animate-spin" />
                  Procesando…
                </>
              ) : (
                <>
                  <Download className="size-5" />
                  Iniciar descarga
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleCancelDownload}
              disabled={!isDownloading}
              size="lg"
              className="h-12 sm:w-32"
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

/* ------------------------------------------------------------------ */
/* Tile — a labelled surface. Quiet by default; never decorative.     */
/* ------------------------------------------------------------------ */

interface TileProps {
  label: string
  htmlFor?: string
  help?: string
  children: React.ReactNode
}

function Tile({ label, htmlFor, help, children }: TileProps) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label
          htmlFor={htmlFor}
          className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {label}
        </Label>
        {help && (
          <span className="text-[11px] text-muted-foreground/60">{help}</span>
        )}
      </div>
      {children}
    </div>
  )
}
