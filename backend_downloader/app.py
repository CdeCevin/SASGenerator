import os
import glob
import yt_dlp
from yt_dlp.networking.impersonate import ImpersonateTarget
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="SASDownloader Legacy API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"]
)

TMP_DIR = "/tmp/downloads"
os.makedirs(TMP_DIR, exist_ok=True)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
COOKIES_PATH = os.path.join(BASE_DIR, "cookies.txt")

# Soporte para inyectar cookies via variable de entorno COOKIES_CONTENT (Railway / cualquier PaaS).
# Si el archivo no existe pero la variable de entorno está seteada, se escribe el archivo en runtime.
_cookies_env = os.environ.get("COOKIES_CONTENT", "").strip()
if not os.path.exists(COOKIES_PATH) and _cookies_env:
    try:
        with open(COOKIES_PATH, 'w', encoding='utf-8') as _f:
            _f.write(_cookies_env)
        print(f"[SASDownloader] cookies.txt generado desde variable de entorno COOKIES_CONTENT")
    except Exception as _e:
        print(f"[SASDownloader] ERROR al escribir cookies.txt desde env: {_e}")

if os.path.exists(COOKIES_PATH):
    print(f"[SASDownloader] COOKIES.TXT ENCONTRADO EN {COOKIES_PATH}")
    with open(COOKIES_PATH, 'r', encoding='utf-8', errors='ignore') as f:
        print(f"[SASDownloader] Primera linea del cookie: {f.readline().strip()}")
else:
    print(f"[SASDownloader] ATENCION: cookies.txt NO ENCONTRADO. Las descargas usaran fallback sin cookies.")

@app.get("/")
def read_root():
    return {"status": "ready", "service": "SASDownloader Legacy"}

@app.get("/diagnose")
def diagnose(url: str = Query(...)):
    import sys, io
    output = io.StringIO()
    original_stdout = sys.stdout
    original_stderr = sys.stderr
    sys.stdout = output
    sys.stderr = output
    results = {}
    try:
        print("=== TEST 1: Chrome impersonate + default clients ===")
        ydl_opts_1 = {'quiet': False, 'no_warnings': False, 'nocheckcertificate': True, 'impersonate': ImpersonateTarget.from_str('chrome')}
        if os.path.exists(COOKIES_PATH):
            ydl_opts_1['cookiefile'] = COOKIES_PATH
        try:
            with yt_dlp.YoutubeDL(ydl_opts_1) as ydl:
                info = ydl.extract_info(url, download=False)
                print(f"SUCCESS. Formats found: {len(info.get('formats', []))}")
                results["test1"] = "SUCCESS"
        except Exception as e:
            print(f"FAILED: {str(e)}")
            results["test1"] = f"FAILED: {str(e)}"

        print("\n=== TEST 2: Chrome impersonate + restricted clients ===")
        ydl_opts_2 = {'quiet': False, 'no_warnings': False, 'nocheckcertificate': True, 'impersonate': ImpersonateTarget.from_str('chrome'), 'extractor_args': {'youtube': {'player_client': ['android', 'ios', 'tv']}}}
        if os.path.exists(COOKIES_PATH):
            ydl_opts_2['cookiefile'] = COOKIES_PATH
        try:
            with yt_dlp.YoutubeDL(ydl_opts_2) as ydl:
                info = ydl.extract_info(url, download=False)
                print(f"SUCCESS. Formats found: {len(info.get('formats', []))}")
                results["test2"] = "SUCCESS"
        except Exception as e:
            print(f"FAILED: {str(e)}")
            results["test2"] = f"FAILED: {str(e)}"

        print("\n=== TEST 3: Chrome impersonate + restricted clients, NO COOKIES ===")
        ydl_opts_3 = {'quiet': False, 'no_warnings': False, 'nocheckcertificate': True, 'impersonate': ImpersonateTarget.from_str('chrome'), 'extractor_args': {'youtube': {'player_client': ['android', 'ios', 'tv']}}}
        try:
            with yt_dlp.YoutubeDL(ydl_opts_3) as ydl:
                info = ydl.extract_info(url, download=False)
                print(f"SUCCESS. Formats found: {len(info.get('formats', []))}")
                results["test3"] = "SUCCESS"
        except Exception as e:
            print(f"FAILED: {str(e)}")
            results["test3"] = f"FAILED: {str(e)}"

        print("\n=== TEST 4: Urllib default + restricted clients, NO COOKIES ===")
        ydl_opts_4 = {'quiet': False, 'no_warnings': False, 'nocheckcertificate': True, 'extractor_args': {'youtube': {'player_client': ['android', 'ios', 'tv']}}}
        try:
            with yt_dlp.YoutubeDL(ydl_opts_4) as ydl:
                info = ydl.extract_info(url, download=False)
                print(f"SUCCESS. Formats found: {len(info.get('formats', []))}")
                results["test4"] = "SUCCESS"
        except Exception as e:
            print(f"FAILED: {str(e)}")
            results["test4"] = f"FAILED: {str(e)}"

        print("\n=== TEST 5: curl_cffi directo a YouTube ===")
        try:
            import curl_cffi.requests as cffi
            resp = cffi.get(url, impersonate="chrome", verify=False)
            print(f"SUCCESS. Status: {resp.status_code}")
            results["test5"] = f"SUCCESS (Status: {resp.status_code})"
        except Exception as e:
            print(f"FAILED: {str(e)}")
            results["test5"] = f"FAILED: {str(e)}"

        print("\n=== TEST NODEJS PATH ===")
        import subprocess
        try:
            node_version = subprocess.check_output(["node", "-v"], text=True).strip()
            print(f"NodeJS is installed: {node_version}")
            results["nodejs"] = f"Installed: {node_version}"
        except Exception as e:
            print(f"NodeJS not found in PATH: {str(e)}")
            results["nodejs"] = f"Not found: {str(e)}"

    finally:
        sys.stdout = original_stdout
        sys.stderr = original_stderr
    return {"results": results, "logs": output.getvalue()}

def clean_youtube_url(url: str) -> str:
    url = url.strip()
    if "youtube.com" in url or "youtu.be" in url:
        import urllib.parse as urlparse
        try:
            parsed = urlparse.urlparse(url)
            if "watch" in parsed.path:
                params = urlparse.parse_qs(parsed.query)
                video_id = params.get('v')
                if video_id:
                    return f"https://www.youtube.com/watch?v={video_id[0]}"
            elif "youtu.be" in parsed.netloc:
                path_parts = parsed.path.strip("/").split("/")
                if path_parts and path_parts[0]:
                    return f"https://youtu.be/{path_parts[0]}"
            elif "shorts" in parsed.path:
                path_parts = parsed.path.strip("/").split("/")
                if "shorts" in path_parts:
                    idx = path_parts.index("shorts")
                    if idx + 1 < len(path_parts):
                        return f"https://www.youtube.com/shorts/{path_parts[idx + 1]}"
        except Exception:
            pass
    return url

@app.get("/fetch-formats")
def fetch_formats(url: str = Query(..., description="URL del video de YouTube u otro portal")):
    """Obtiene los formatos y resoluciones de video disponibles."""
    url = clean_youtube_url(url)
    chrome = ImpersonateTarget.from_str('chrome')
    strategies = [
        # Estrategia 1: android_vr y tv_embedded sin clientes web/móviles.
        # Bypassea la detección de bot de forma limpia y obtiene todas las calidades (1080p, 720p, etc.)
        {'quiet': True, 'no_warnings': True, 'nocheckcertificate': True,
         'impersonate': chrome,
         'extractor_args': {'youtube': {'player_client': ['android_vr', 'tv_embedded', '-web', '-mweb', '-web_safari', '-android', '-ios']}}},
        # Estrategia 2: tv, tv_embedded y android_vr (fallback)
        {'quiet': True, 'no_warnings': True, 'nocheckcertificate': True,
         'impersonate': chrome,
         'extractor_args': {'youtube': {'player_client': ['tv', 'tv_embedded', 'android_vr', '-web', '-mweb', '-web_safari', '-android', '-ios']}}},
    ]

    info = None
    last_error = None
    for attempt, opts in enumerate(strategies, start=1):
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
            break
        except Exception as e:
            last_error = e
            print(f"[SASDownloader] fetch-formats intento {attempt} fallido: {e}")

    if info is None:
        raise HTTPException(status_code=400, detail=f"Error al obtener formatos del video: {str(last_error)}")

    try:
        resolutions = set()
        for f in info.get('formats', []):
            if f.get('vcodec') != 'none' and f.get('height') is not None:
                resolutions.add(f'{f["height"]}p')
        sorted_resolutions = sorted(list(resolutions), key=lambda x: int(x.replace('p', '')), reverse=True)
        return {
            "title": info.get('title', 'Video'),
            "duration": info.get('duration', 0),
            "formats": ["Mejor calidad disponible"] + sorted_resolutions
        }
    except Exception as parse_error:
        raise HTTPException(status_code=500, detail=f"Error al procesar formatos: {str(parse_error)}")

@app.get("/download")
def download_video(
    url: str = Query(...),
    format_type: str = Query(...),
    quality: str = Query(...),
    custom_name: str = Query(None)
):
    """
    Descarga el recurso con FFmpeg y lo envía como FileResponse.
    Usa subdirectorio UUID por request para evitar colisiones concurrentes.
    IMPORTANTE: Nunca usar format='best' para video porque limita a 360p.
    Los streams de alta calidad (720p+) son separados y requieren fusion FFmpeg.
    """
    url = clean_youtube_url(url)
    import uuid

    request_id = uuid.uuid4().hex
    work_dir = os.path.join(TMP_DIR, request_id)
    os.makedirs(work_dir, exist_ok=True)

    filename_base = custom_name.strip() if custom_name and custom_name.strip() else '%(title)s'
    output_template = os.path.join(work_dir, f"{filename_base}.%(ext)s")

    if format_type == "Video":
        if quality != "Mejor calidad disponible":
            res = quality.replace('p', '')
            format_str = f'bestvideo[height<={res}]+bestaudio/bestvideo[height<={res}]/best[height<={res}]'
        else:
            format_str = 'bestvideo+bestaudio/best'
        merge_fmt = 'mp4'
        final_extension = '.mp4'
    else:
        format_str = 'bestaudio/best'
        merge_fmt = None
        final_extension = '.mp3'

    # Impersonate Chrome a nivel TLS — clave para evitar detección de bot sin cookies
    chrome = ImpersonateTarget.from_str('chrome')
    base_opts = {
        'outtmpl': output_template,
        'quiet': True,
        'no_warnings': True,
        'nocheckcertificate': True,
        'impersonate': chrome,
        'format': format_str,
    }
    if merge_fmt:
        base_opts['merge_output_format'] = merge_fmt
    if format_type == "Audio":
        base_opts['postprocessors'] = [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '192'}]

    strategies = [
        # Estrategia 1: android_vr y tv_embedded sin clientes web/móviles.
        # Evita el bloqueo de bot y descarga a la calidad solicitada (1080p/720p/etc.)
        {**base_opts, 'extractor_args': {'youtube': {'player_client': ['android_vr', 'tv_embedded', '-web', '-mweb', '-web_safari', '-android', '-ios']}}},
        # Estrategia 2: tv, tv_embedded y android_vr (fallback)
        {**base_opts, 'extractor_args': {'youtube': {'player_client': ['tv', 'tv_embedded', 'android_vr', '-web', '-mweb', '-web_safari', '-android', '-ios']}}},
    ]

    info = None
    last_error = None
    for attempt, opts in enumerate(strategies, start=1):
        try:
            print(f"[SASDownloader] Intento {attempt} de descarga...")
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True)
            print(f"[SASDownloader] Intento {attempt} exitoso.")
            break
        except Exception as e:
            last_error = e
            print(f"[SASDownloader] Intento {attempt} fallido: {e}")

    if info is None:
        for f in glob.glob(os.path.join(work_dir, "*")):
            try: os.remove(f)
            except Exception: pass
        try: os.rmdir(work_dir)
        except Exception: pass
        raise HTTPException(status_code=500, detail=f"Error durante la descarga: {str(last_error)}")

    # Buscar el archivo final con glob (prepare_filename devuelve nombre pre-merge incorrecto)
    candidates = sorted(
        glob.glob(os.path.join(work_dir, f"*{final_extension}")),
        key=os.path.getmtime,
        reverse=True
    )
    if not candidates:
        candidates = sorted(
            [f for f in glob.glob(os.path.join(work_dir, "*")) if os.path.isfile(f)],
            key=os.path.getmtime,
            reverse=True
        )
    if not candidates:
        raise HTTPException(status_code=500, detail="El archivo se descargo pero no se encuentra en el servidor temporal.")

    filename_real = candidates[0]

    if custom_name and custom_name.strip():
        download_name = f"{custom_name.strip()}{final_extension}"
    else:
        raw_title = info.get('title', 'descarga')
        safe_title = "".join(c for c in raw_title if c not in r'\/:*?"<>|').strip()
        download_name = f"{safe_title}{final_extension}"

    # Usar RFC 5987 para soportar nombres con caracteres Unicode/especiales correctamente
    from urllib.parse import quote
    encoded_name = quote(download_name, safe='')
    content_disposition = "attachment; filename=\"{}\"; filename*=UTF-8''{}".format(
        download_name.replace('"', ''), encoded_name
    )

    return FileResponse(
        filename_real,
        media_type='application/octet-stream',
        headers={"Content-Disposition": content_disposition}
    )
