import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Slider } from "@/components/ui/slider"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Select } from "@/components/ui/select"
import {
  Image as ImageIcon,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Palette,
} from "lucide-react"

export function Sandbox() {
  const [sliderValue, setSliderValue] = useState([40])
  const [radioValue, setRadioValue] = useState("video")
  const [inputValue, setInputValue] = useState("")
  const [progressValue] = useState(66)

  return (
    <div className="space-y-8 p-6 animate-fade-in">
      {/* Hero */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Palette className="size-5 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Design System — Studio</h1>
        </div>
        <p className="text-muted-foreground">
          Sandbox visual de los componentes base que se aplicarán en las 3 fases de rediseño.
        </p>
      </div>

      <Separator />

      {/* Colors */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">1. Paleta de colores (Studio)</h2>
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Swatch label="background" className="bg-background border" hex="#0B0D12" />
              <Swatch label="card" className="bg-card border" hex="#14171F" />
              <Swatch label="muted" className="bg-muted border" hex="#1A1E29" />
              <Swatch label="primary" className="bg-primary" hex="#7C6CF6" />
              <Swatch label="secondary" className="bg-secondary" hex="#22D3EE" />
              <Swatch label="destructive" className="bg-destructive" hex="#ef4444" />
              <Swatch label="success" className="bg-[color:var(--success)]" hex="#10b981" />
              <Swatch label="warning" className="bg-[color:var(--warning)]" hex="#f59e0b" />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Buttons */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">2. Botones</h2>
        <Card>
          <CardContent className="pt-6 flex flex-wrap gap-3">
            <Button>Primary default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="accent">Accent</Button>
            <Button variant="link">Link</Button>
          </CardContent>
          <CardContent className="pt-0 flex flex-wrap gap-3 items-center">
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
            <Button size="xl">X-Large</Button>
            <Button disabled>Disabled</Button>
            <Button>
              <Loader2 className="animate-spin" />
              Loading
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Inputs */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">3. Inputs</h2>
        <Card>
          <CardContent className="pt-6 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="sb-input">URL del video</Label>
              <Input
                id="sb-input"
                placeholder="https://www.youtube.com/watch?v=..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sb-textarea">Texto del meme</Label>
              <Textarea id="sb-textarea" placeholder="Escribe el texto del meme..." />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sb-select">Calidad</Label>
              <Select id="sb-select" defaultValue="1080p">
                <option value="best">Mejor calidad disponible</option>
                <option value="1080p">1080p</option>
                <option value="720p">720p</option>
                <option value="480p">480p</option>
              </Select>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Tabs + Radio + Slider + Progress */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">4. Controles compuestos</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Tabs</CardTitle>
              <CardDescription>Navegación principal entre pestañas</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="meme">
                <TabsList className="w-full">
                  <TabsTrigger value="meme" className="flex-1">Memes</TabsTrigger>
                  <TabsTrigger value="remover" className="flex-1">Fondo</TabsTrigger>
                  <TabsTrigger value="downloader" className="flex-1">YT</TabsTrigger>
                </TabsList>
                <TabsContent value="meme" className="pt-4 text-sm text-muted-foreground">
                  Editor de memes con capas.
                </TabsContent>
                <TabsContent value="remover" className="pt-4 text-sm text-muted-foreground">
                  Quitar fondo con BiRefNet.
                </TabsContent>
                <TabsContent value="downloader" className="pt-4 text-sm text-muted-foreground">
                  Descargador de YouTube.
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Radio Group</CardTitle>
              <CardDescription>Selección única entre opciones</CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup value={radioValue} onValueChange={setRadioValue}>
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="video" id="r1" />
                  <Label htmlFor="r1">Video (MP4)</Label>
                </div>
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="audio" id="r2" />
                  <Label htmlFor="r2">Solo Audio (MP3)</Label>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Slider</CardTitle>
              <CardDescription>
                Tamaño de fuente: <span className="font-mono text-primary">{sliderValue[0]}px</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Slider
                value={sliderValue}
                onValueChange={setSliderValue}
                min={10}
                max={150}
                step={1}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Progress</CardTitle>
              <CardDescription>Indicador de carga indeterminada</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={progressValue} />
              <p className="text-xs text-muted-foreground">
                {progressValue}% completado
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Alerts + Badges */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">5. Alertas y Badges</h2>
        <Card>
          <CardContent className="pt-6 space-y-3">
            <Alert>
              <CheckCircle2 className="size-4" />
              <AlertTitle>Éxito</AlertTitle>
              <AlertDescription>
                El modelo BiRefNet terminó de procesar la imagen.
              </AlertDescription>
            </Alert>
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                No se pudo conectar con el servidor de Hugging Face.
              </AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-2 pt-2">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="destructive">Destructive</Badge>
              <Badge variant="success">Success</Badge>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Sample downloader panel mockup */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">6. Mockup: Descargador (Fase 1 aplicada)</h2>
        <Card className="shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]">
          <CardContent className="p-6 sm:p-8 space-y-5">
            <header className="space-y-1.5">
              <h3
                className="text-3xl tracking-tight text-foreground"
                style={{
                  fontFamily: "var(--font-display)",
                  fontStyle: "italic",
                  fontWeight: 400,
                  lineHeight: 1.1,
                }}
              >
                SAS Downloader
              </h3>
              <p className="text-sm text-muted-foreground">
                Pega una URL de YouTube y descárgala en el formato que necesites.
              </p>
            </header>

            <div className="space-y-2.5">
              <Label
                htmlFor="mock-url"
                className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                URL del video
              </Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  id="mock-url"
                  placeholder="https://www.youtube.com/watch?v=…"
                  className="h-12 flex-1 text-base"
                />
                <Button variant="secondary" className="h-12 px-5">
                  Buscar formatos
                </Button>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-2.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Formato
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    aria-pressed="true"
                    className="flex flex-col items-start gap-1.5 rounded-lg border-2 border-primary bg-primary/10 p-3 text-left"
                  >
                    <div className="size-5 rounded bg-primary" />
                    <span className="text-sm font-semibold leading-none">Video</span>
                    <span className="text-xs text-muted-foreground leading-none">MP4</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed="false"
                    className="flex flex-col items-start gap-1.5 rounded-lg border-2 border-border bg-card p-3 text-left"
                  >
                    <div className="size-5 rounded bg-muted" />
                    <span className="text-sm font-semibold leading-none">Solo audio</span>
                    <span className="text-xs text-muted-foreground leading-none">MP3</span>
                  </button>
                </div>
              </div>
              <div className="space-y-2.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Calidad
                </Label>
                <Select className="h-12 text-base" defaultValue="Mejor calidad disponible">
                  <option>Mejor calidad disponible</option>
                  <option>1080p</option>
                  <option>720p</option>
                </Select>
              </div>
            </div>

            <div className="rounded-lg border border-dashed border-border p-4 flex items-center gap-3">
              <div className="size-2 rounded-full bg-muted-foreground/40" />
              <span className="text-sm text-muted-foreground">
                Pega una URL de YouTube arriba para empezar.
              </span>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
              <Button
                size="lg"
                className="flex-1 h-12 bg-foreground text-background hover:bg-foreground/90 font-semibold"
              >
                Iniciar descarga
              </Button>
              <Button variant="outline" size="lg" className="h-12 sm:w-32">
                Cancelar
              </Button>
            </div>
          </CardContent>
          <CardFooter className="text-xs text-muted-foreground">
            <ImageIcon className="size-3 mr-1" /> Mockup estático — la versión en vivo está en la pestaña Descargador.
          </CardFooter>
        </Card>
      </section>
    </div>
  )
}

function Swatch({
  label,
  hex,
  className,
}: {
  label: string
  hex: string
  className?: string
}) {
  return (
    <div className="space-y-1.5">
      <div
        className={`h-16 w-full rounded-lg border-border ${className ?? ""}`}
      />
      <div className="text-xs">
        <div className="font-medium">{label}</div>
        <div className="font-mono text-muted-foreground">{hex}</div>
      </div>
    </div>
  )
}
