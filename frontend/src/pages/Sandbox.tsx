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
  Download,
  Image as ImageIcon,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Palette,
  Sparkles,
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
        <h2 className="text-xl font-semibold">6. Mockup: Descargador (preview Fase 1)</h2>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Download className="size-5 text-primary" />
              <CardTitle>Descargador de YouTube</CardTitle>
            </div>
            <CardDescription>Esta es la dirección que tomará la pestaña del descargador.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="mock-url">URL del video</Label>
              <div className="flex gap-2">
                <Input
                  id="mock-url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="flex-1"
                />
                <Button variant="secondary">Cargar resoluciones</Button>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Formato</Label>
                <RadioGroup value={radioValue} onValueChange={setRadioValue}>
                  <div className="flex items-center gap-3">
                    <RadioGroupItem value="video" id="m1" />
                    <Label htmlFor="m1" className="font-normal normal-case tracking-normal">
                      Video (MP4)
                    </Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <RadioGroupItem value="audio" id="m2" />
                    <Label htmlFor="m2" className="font-normal normal-case tracking-normal">
                      Solo Audio (MP3)
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="mock-quality">Calidad</Label>
                <Select id="mock-quality" defaultValue="1080p">
                  <option value="best">Mejor calidad disponible</option>
                  <option value="1080p">1080p</option>
                  <option value="720p">720p</option>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="mock-name">Nombre del archivo (opcional)</Label>
              <Input id="mock-name" placeholder="ej: video-epico" />
            </div>

            <Separator />

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-[color:var(--success)]" />
              Listo para descargar
            </div>

            <Button size="xl" className="w-full">
              <Sparkles />
              Iniciar descarga
            </Button>
          </CardContent>
          <CardFooter className="text-xs text-muted-foreground">
            <ImageIcon className="size-3 mr-1" /> Mockup estático — la lógica real viene en Fase 1.
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
