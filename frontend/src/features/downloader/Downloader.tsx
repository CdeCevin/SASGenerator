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
  const [logs, setLogs] = useState<string[]>(["[Sistema] Listo para descargar."])
  const abortControllerRef = useRef<AbortController | null>(null)

  const addLog = (message: string) => {
    const time = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
    setLogs((prev) => [...prev, `[${time}] ${message}`])
  }

  const handleFetchFormats = async () => {
    if (!ytUrl.trim()) {
      setDownloadError("Por favor, ingresa una URL válida.")
      addLog("Error: URL vacía.")
      return
    }

    if (!apiUrl) {
      setDownloadError(
        "Configura la variable de entorno VITE_DOWNLOADER_API_URL para el servidor de descargas."
      )
      addLog("Error: URL del servidor de descargas no configurada.")
      return
    }

    setIsFetchingFormats(true)
    setDownloadError(null)
    setFormats([])
    addLog(`Buscando formatos para: ${ytUrl}`)

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

      addLog(`Video encontrado: "${data.title || "Video"}"`)
      addLog(
        `Formatos cargados exitosamente: ${data.formats ? data.formats.length : 1} calidades.`
      )
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error
          ? err.message
          : "Error al buscar formatos en el servidor."
      setDownloadError(errMsg)
      addLog(`Error al buscar formatos: ${errMsg}`)
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
      addLog("Error: URL del servidor de descargas no configurada.")
      return
    }

    setIsDownloading(true)
    setDownloadError(null)
    setDownloadStatus("Conectando con el servidor...")
    addLog(
      `Iniciando descarga en formato: ${
        downloadFormat === "Video"
          ? `Video (MP4 - ${downloadQuality})`
          : "Audio (MP3)"
      }`
    )

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const cleanApiUrl = apiUrl.replace(/\/$/, "")
      const downloadEndpoint =
        `${cleanApiUrl}/download?url=${encodeURIComponent(ytUrl)}` +
        `&format_type=${downloadFormat}` +
        `&quality=${encodeURIComponent(downloadQuality)}` +
        `&custom_name=${encodeURIComponent(customFileName)}`

      addLog(
        "Descargando y procesando en el servidor (esto puede demorar un par de minutos)..."
      )
      setDownloadStatus("Descargando y convirtiendo en el servidor...")

      const response = await fetch(downloadEndpoint, { signal: controller.signal })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || "El servidor falló durante la descarga.")
      }

      addLog("Descarga finalizada en el servidor. Transfiriendo archivo al navegador...")
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

      addLog(`¡Descarga completada! Archivo guardado: "${filename}"`)
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        addLog("Descarga cancelada por el usuario.")
      } else {
        const errMsg =
          err instanceof Error ? err.message : "Error al procesar la descarga."
        setDownloadError(errMsg)
        addLog(`Error en la descarga: ${errMsg}`)
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
      addLog("Cancelando descarga a petición del usuario...")
    }
  }

  const isBusy = isDownloading || isFetchingFormats

  return (
    <div className="max-w-2xl mx-auto p-2 sm:p-4 animate-fade-in">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Download className="size-5 text-primary" />
            <CardTitle>SAS Downloader</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* URL */}
          <div className="space-y-2">
            <Label htmlFor="yt-url">URL del video</Label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                id="yt-url"
                type="text"
                placeholder="https://www.youtube.com/watch?v=..."
                value={ytUrl}
                onChange={(e) => setYtUrl(e.target.value)}
                disabled={isBusy}
                className="flex-1"
              />
              <Button
                variant="secondary"
                onClick={handleFetchFormats}
                disabled={isBusy || !ytUrl.trim()}
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

          {/* Format + Quality */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-3">
              <Label>Formato de descarga</Label>
              <RadioGroup
                value={downloadFormat}
                onValueChange={(v) => setDownloadFormat(v as DownloadFormat)}
                disabled={isDownloading}
                className="space-y-2"
              >
                <div className="flex items-center gap-2.5">
                  <RadioGroupItem value="Video" id="fmt-video" />
                  <Label
                    htmlFor="fmt-video"
                    className="font-normal normal-case tracking-normal text-sm cursor-pointer"
                  >
                    Video (MP4)
                  </Label>
                </div>
                <div className="flex items-center gap-2.5">
                  <RadioGroupItem value="Audio" id="fmt-audio" />
                  <Label
                    htmlFor="fmt-audio"
                    className="font-normal normal-case tracking-normal text-sm cursor-pointer"
                  >
                    Solo Audio (MP3)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quality">Calidad</Label>
              <Select
                id="quality"
                value={downloadQuality}
                onChange={(e) => setDownloadQuality(e.target.value)}
                disabled={isDownloading || downloadFormat !== "Video"}
                className="w-full"
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
            <Label htmlFor="custom-name">Nombre del archivo (opcional)</Label>
            <Input
              id="custom-name"
              type="text"
              placeholder="ej: video-epico (se usará el título original si lo omites)"
              value={customFileName}
              onChange={(e) => setCustomFileName(e.target.value)}
              disabled={isDownloading}
            />
          </div>

          {/* Error */}
          {downloadError && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{downloadError}</AlertDescription>
            </Alert>
          )}

          {/* Status */}
          {isBusy ? (
            <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 p-4">
              <Loader2 className="size-4 animate-spin text-primary" />
              <span className="text-sm font-medium text-primary">
                {isDownloading ? downloadStatus : "Buscando formatos..."}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--success)]">
              <CheckCircle2 className="size-4" />
              ¡Listo para descargar!
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              size="xl"
              onClick={handleDownload}
              disabled={isBusy || !ytUrl.trim()}
              className="flex-[2] tracking-wider"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="animate-spin" />
                  PROCESANDO...
                </>
              ) : (
                <>
                  <Download />
                  INICIAR DESCARGA
                </>
              )}
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelDownload}
              disabled={!isDownloading}
              className="flex-1"
            >
              <X />
              Cancelar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Log */}
      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Registro de actividad</CardTitle>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setLogs(["[Sistema] Log limpiado."])}
          >
            Limpiar log
          </Button>
        </CardHeader>
        <CardContent>
          <div className="h-32 overflow-y-auto rounded-md border border-border bg-[#050508] p-3 font-mono text-xs leading-relaxed text-[color:var(--success)]">
            {logs.map((log, idx) => (
              <div
                key={idx}
                className="mb-1 border-b border-border/30 pb-0.5 last:border-b-0"
              >
                {log}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
