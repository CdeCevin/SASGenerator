import { useRef, useState } from "react"
import { Download, Loader2, AlertCircle, CheckCircle2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Alert, AlertDescription } from "@/components/ui/alert"

type DownloadFormat = "Video" | "Audio"

interface DownloaderProps {
  apiUrl: string
}

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

  return (
    <div className="w-full max-w-5xl mx-auto p-4 sm:p-6 animate-fade-in">
      <Card>
        <CardHeader className="pb-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2.5">
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

        <CardContent className="space-y-6">
          {/* URL — full width, prominent */}
          <div className="space-y-2">
            <Label htmlFor="yt-url" className="text-sm">
              URL del video
            </Label>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                id="yt-url"
                type="text"
                placeholder="https://www.youtube.com/watch?v=..."
                value={ytUrl}
                onChange={(e) => setYtUrl(e.target.value)}
                disabled={isBusy}
                className="flex-1 h-12 text-base"
              />
              <Button
                variant="secondary"
                size="lg"
                onClick={handleFetchFormats}
                disabled={isBusy || !ytUrl.trim()}
                className="h-12 px-6"
              >
                {isFetchingFormats ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Cargando
                  </>
                ) : (
                  "Cargar resoluciones"
                )}
              </Button>
            </div>
          </div>

          {/* Format + Quality — 2 columns */}
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label className="text-sm">Formato de descarga</Label>
              <RadioGroup
                value={downloadFormat}
                onValueChange={(v) => setDownloadFormat(v as DownloadFormat)}
                disabled={isDownloading}
                className="space-y-3"
              >
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="Video" id="fmt-video" className="size-5" />
                  <Label
                    htmlFor="fmt-video"
                    className="font-normal normal-case tracking-normal text-base cursor-pointer"
                  >
                    Video (MP4)
                  </Label>
                </div>
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="Audio" id="fmt-audio" className="size-5" />
                  <Label
                    htmlFor="fmt-audio"
                    className="font-normal normal-case tracking-normal text-base cursor-pointer"
                  >
                    Solo Audio (MP3)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-3">
              <Label htmlFor="quality" className="text-sm">
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

          {/* Custom name */}
          <div className="space-y-2">
            <Label htmlFor="custom-name" className="text-sm">
              Nombre del archivo (opcional)
            </Label>
            <Input
              id="custom-name"
              type="text"
              placeholder="ej: video-epico (se usará el título original si lo omites)"
              value={customFileName}
              onChange={(e) => setCustomFileName(e.target.value)}
              disabled={isDownloading}
              className="h-12 text-base"
            />
          </div>

          {/* Error */}
          {downloadError && (
            <Alert variant="destructive">
              <AlertCircle className="size-5" />
              <AlertDescription className="text-base">{downloadError}</AlertDescription>
            </Alert>
          )}

          {/* Status */}
          {isBusy ? (
            <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 p-4">
              <Loader2 className="size-5 animate-spin text-primary" />
              <span className="text-base font-medium text-primary">
                {isDownloading ? downloadStatus : "Buscando formatos disponibles..."}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-base font-semibold text-[color:var(--success)]">
              <CheckCircle2 className="size-5" />
              ¡Listo para descargar!
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              size="xl"
              onClick={handleDownload}
              disabled={isBusy || !ytUrl.trim()}
              className="flex-[3] h-14 text-lg tracking-wider"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="size-5 animate-spin" />
                  PROCESANDO...
                </>
              ) : (
                <>
                  <Download className="size-5" />
                  INICIAR DESCARGA
                </>
              )}
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelDownload}
              disabled={!isDownloading}
              className="flex-1 h-14 text-base"
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
