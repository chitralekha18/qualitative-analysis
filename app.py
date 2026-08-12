from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlencode, urlparse
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import os
import json
import mimetypes
import re
import socket
import ssl
import sys
import time
import zipfile
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parent
EXPORTS = ROOT / "exports"
DATA = ROOT / "data"
TRANSCRIPTS = ROOT / "transcripts"
DEFAULT_RECORDINGS = ROOT / "recordings"


def load_local_env():
    env_path = ROOT / ".env"
    if not env_path.exists():
        return {}

    values = {}
    for raw_line in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            values[key] = value
    return values


LOCAL_ENV = load_local_env()
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", LOCAL_ENV.get("OPENAI_API_KEY", "")).strip()
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", LOCAL_ENV.get("OPENAI_MODEL", "gpt-4.1-mini")).strip() or "gpt-4.1-mini"
DEEPGRAM_API_KEY = os.environ.get("DEEPGRAM_API_KEY", LOCAL_ENV.get("DEEPGRAM_API_KEY", "")).strip()
DEEPGRAM_MODEL = os.environ.get("DEEPGRAM_MODEL", LOCAL_ENV.get("DEEPGRAM_MODEL", "nova-3")).strip() or "nova-3"
CA_BUNDLE_PATH = os.environ.get("CA_BUNDLE_PATH", LOCAL_ENV.get("CA_BUNDLE_PATH", "")).strip()
RECORDINGS_FOLDER = os.environ.get("RECORDINGS_FOLDER", LOCAL_ENV.get("RECORDINGS_FOLDER", "")).strip()
RECORDINGS = Path(RECORDINGS_FOLDER).expanduser().resolve() if RECORDINGS_FOLDER else DEFAULT_RECORDINGS
OPENAI_REQUEST_TIMEOUT_SEC = int(os.environ.get("OPENAI_REQUEST_TIMEOUT_SEC", LOCAL_ENV.get("OPENAI_REQUEST_TIMEOUT_SEC", "120") or "120"))
OPENAI_REQUEST_RETRIES = int(os.environ.get("OPENAI_REQUEST_RETRIES", LOCAL_ENV.get("OPENAI_REQUEST_RETRIES", "2") or "2"))

TRANSCRIPT_JSON_DIR = TRANSCRIPTS
SUPPORTED_AUDIO_EXTENSIONS = {".m4a", ".mp3", ".wav", ".aac", ".ogg", ".webm", ".mp4"}


def update_local_env(updates):
    env_path = ROOT / ".env"
    lines = env_path.read_text(encoding="utf-8", errors="replace").splitlines() if env_path.exists() else []
    pending = dict(updates)
    output = []
    for line in lines:
        if "=" not in line or line.lstrip().startswith("#"):
            output.append(line)
            continue
        key = line.split("=", 1)[0].strip()
        if key in pending:
            output.append(f"{key}={pending.pop(key)}")
        else:
            output.append(line)
    for key, value in pending.items():
        output.append(f"{key}={value}")
    env_path.write_text("\n".join(output).rstrip() + "\n", encoding="utf-8")


def apply_runtime_settings(payload):
    global OPENAI_API_KEY, DEEPGRAM_API_KEY, RECORDINGS_FOLDER, RECORDINGS
    updates = {}
    openai_key = str(payload.get("openaiApiKey", "")).strip()
    deepgram_key = str(payload.get("deepgramApiKey", "")).strip()
    folder_value = str(payload.get("recordingsFolder", "")).strip()
    if any("\n" in value or "\r" in value for value in (openai_key, deepgram_key, folder_value)):
        raise ValueError("Settings values cannot contain line breaks.")
    requested_folder = Path(folder_value).expanduser().resolve() if folder_value else DEFAULT_RECORDINGS
    if not requested_folder.exists() or not requested_folder.is_dir():
        raise ValueError(f"Recordings folder does not exist: {requested_folder}")
    if openai_key:
        OPENAI_API_KEY = openai_key
        updates["OPENAI_API_KEY"] = openai_key
    if deepgram_key:
        DEEPGRAM_API_KEY = deepgram_key
        updates["DEEPGRAM_API_KEY"] = deepgram_key
    RECORDINGS_FOLDER = folder_value
    RECORDINGS = requested_folder
    updates["RECORDINGS_FOLDER"] = folder_value
    update_local_env(updates)

DEFAULT_TOPICS = [
    "Context",
    "Process",
    "Experience",
    "Challenge",
    "Outcome",
]


def safe_filename(name):
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._")
    return cleaned or "coding_export"


def transcript_sort_key(path):
    match = re.search(r"P(\d+)", path.stem, re.IGNORECASE)
    if match:
        return (0, int(match.group(1)), path.name.lower())
    return (1, path.name.lower())


def build_transcript_turns(words):
    turns = []
    current = None

    for item in words or []:
        speaker = item.get("speaker")
        token = item.get("punctuated_word") or item.get("word") or ""
        start_time = item.get("start")
        end_time = item.get("end")
        if not token:
            continue

        if current is None or speaker != current["speakerId"]:
            if current and current["words"]:
                current["text"] = " ".join(current["words"]).strip()
                current.pop("localCursor", None)
                turns.append(current)
            current = {
                "speakerId": speaker,
                "speakerLabel": None,
                "speakerRole": None,
                "words": [],
                "wordTimings": [],
                "localCursor": 0,
                "text": "",
                "startTimeSec": float(start_time) if isinstance(start_time, (int, float)) else None,
                "endTimeSec": float(end_time) if isinstance(end_time, (int, float)) else None,
            }

        local_start = current["localCursor"]
        current["words"].append(token)
        current["wordTimings"].append({
            "start": local_start,
            "end": local_start + len(token),
            "startTimeSec": float(start_time) if isinstance(start_time, (int, float)) else None,
            "endTimeSec": float(end_time) if isinstance(end_time, (int, float)) else None,
        })
        current["localCursor"] = local_start + len(token) + 1
        if current.get("startTimeSec") is None and isinstance(start_time, (int, float)):
            current["startTimeSec"] = float(start_time)
        if isinstance(end_time, (int, float)):
            current["endTimeSec"] = float(end_time)

    if current and current["words"]:
        current["text"] = " ".join(current["words"]).strip()
        current.pop("localCursor", None)
        turns.append(current)

    speaker_ids = []
    for turn in turns:
        if turn["speakerId"] not in speaker_ids:
            speaker_ids.append(turn["speakerId"])

    labels = [
        ("Interviewer", "Interviewer"),
        ("Participant", "Participant"),
    ]
    for index, speaker_id in enumerate(speaker_ids):
        label, role = labels[index] if index < len(labels) else (f"Speaker {index + 1}", f"Speaker {index + 1}")
        for turn in turns:
            if turn["speakerId"] == speaker_id:
                turn["speakerLabel"] = label
                turn["speakerRole"] = role

    cursor = 0
    combined_parts = []
    for turn in turns:
        turn["start"] = cursor
        turn["end"] = cursor + len(turn["text"])
        combined_parts.append(turn["text"])
        cursor = turn["end"] + 2

    transcript_text = "\n\n".join(combined_parts)
    return turns, transcript_text


def parse_deepgram_transcript(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    words = []
    try:
        words = data["results"]["channels"][0]["alternatives"][0].get("words", [])
    except (KeyError, IndexError, TypeError, AttributeError):
        words = []

    turns, transcript_text = build_transcript_turns(words)
    name = path.name.replace(".deepgram.json", ".txt")
    return {
        "id": f"folder:{name}",
        "name": name,
        "recordingStem": path.name.removesuffix(".deepgram.json"),
        "text": transcript_text,
        "turns": turns,
        "source": "deepgram",
    }


def parse_json_response(raw_text):
    text = raw_text.strip()
    if not text:
        raise ValueError("OpenAI returned an empty response.")

    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)

    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]

    return json.loads(text)


def normalize_suggestions(value):
    if not isinstance(value, list):
        return []

    normalized = []
    for item in value:
        if not isinstance(item, dict):
            continue
        code = str(item.get("code", "")).strip()
        rationale = str(item.get("rationale", "")).strip()
        evidence = str(item.get("evidence", "")).strip()
        if not code:
            continue
        normalized.append({
            "code": code,
            "rationale": rationale,
            "evidence": evidence,
        })
    return normalized


def build_ssl_context():
    # Prefer explicit CA bundle from env/.env, then common macOS bundle paths.
    candidates = [
        CA_BUNDLE_PATH,
        os.environ.get("SSL_CERT_FILE", "").strip(),
        "/etc/ssl/cert.pem",
        "/private/etc/ssl/cert.pem",
    ]

    for candidate in candidates:
        if not candidate:
            continue
        path = Path(candidate)
        if path.exists():
            return ssl.create_default_context(cafile=str(path))

    return ssl.create_default_context()


def is_timeout_error(error):
    if isinstance(error, (TimeoutError, socket.timeout)):
        return True
    if isinstance(error, URLError):
        reason = getattr(error, "reason", None)
        return isinstance(reason, (TimeoutError, socket.timeout))
    return False


def should_retry_http_error(error):
    return isinstance(error, HTTPError) and error.code in {408, 409, 425, 429, 500, 502, 503, 504}


SSL_CONTEXT = build_ssl_context()


def deepgram_transcript_path_for_recording(recording_path):
    return TRANSCRIPT_JSON_DIR / f"{recording_path.stem}.deepgram.json"


def list_recording_audio_files():
    if not RECORDINGS.exists():
        return []
    files = []
    for path in sorted(RECORDINGS.rglob("*")):
        if path.is_file() and path.suffix.lower() in SUPPORTED_AUDIO_EXTENSIONS:
            files.append(path)
    return files


def transcribe_recording_with_deepgram(recording_path):
    mime_type = mimetypes.guess_type(recording_path.name)[0] or "application/octet-stream"
    params = urlencode({
        "model": DEEPGRAM_MODEL,
        "smart_format": "true",
        "punctuate": "true",
        "diarize": "true",
    })
    request = Request(
        f"https://api.deepgram.com/v1/listen?{params}",
        data=recording_path.read_bytes(),
        headers={
            "Authorization": f"Token {DEEPGRAM_API_KEY}",
            "Content-Type": mime_type,
        },
        method="POST",
    )
    with urlopen(request, timeout=300, context=SSL_CONTEXT) as response:
        return json.loads(response.read().decode("utf-8"))


def ensure_transcripts_for_recordings():
    recordings = list_recording_audio_files()
    if not recordings:
        return {"recordings": 0, "missing": 0, "created": 0, "failed": 0}

    TRANSCRIPT_JSON_DIR.mkdir(parents=True, exist_ok=True)

    missing = [
        recording
        for recording in recordings
        if not deepgram_transcript_path_for_recording(recording).exists()
    ]

    if not missing:
        print(f"Transcript bootstrap: all {len(recordings)} recording transcripts are available.")
        return {"recordings": len(recordings), "missing": 0, "created": 0, "failed": 0}

    if not DEEPGRAM_API_KEY:
        print(
            "Transcript bootstrap: "
            f"{len(missing)} transcript(s) missing, but DEEPGRAM_API_KEY is not set; skipping auto-transcription."
        )
        return {"recordings": len(recordings), "missing": len(missing), "created": 0, "failed": 0, "error": "DEEPGRAM_API_KEY is not set."}

    print(f"Transcript bootstrap: transcribing {len(missing)} missing recording(s) with Deepgram...")
    completed = 0
    failed = 0
    for recording in missing:
        output_path = deepgram_transcript_path_for_recording(recording)
        try:
            payload = transcribe_recording_with_deepgram(recording)
            output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
            completed += 1
            print(f"  - created {output_path.name} from {recording.name}")
        except (HTTPError, URLError, OSError, json.JSONDecodeError) as error:
            failed += 1
            print(f"  - failed {recording.name}: {error}")

    print(f"Transcript bootstrap complete: created={completed}, failed={failed}, total_missing={len(missing)}")
    return {"recordings": len(recordings), "missing": len(missing), "created": completed, "failed": failed}


def cell_ref(col, row):
    letters = ""
    while col:
        col, remainder = divmod(col - 1, 26)
        letters = chr(65 + remainder) + letters
    return f"{letters}{row}"


PASTEL_CODE_COLORS = [
    "FFE8F3E8", "FFFFF2CC", "FFDDEBF7", "FFFCE4D6", "FFE4DFEC", "FFDDEBF0",
    "FFF4CCCC", "FFEADCF8", "FFD9EAD3", "FFFFE6CC", "FFD0E0E3", "FFFCE5CD",
]


def participant_id(value):
    name = Path(str(value or "")).name
    return name[:-4] if name.lower().endswith(".txt") else Path(name).stem


def format_timestamp(value):
    try:
        total_seconds = max(0, int(float(value)))
    except (TypeError, ValueError):
        return ""
    return f"{total_seconds // 60:02d}:{total_seconds % 60:02d}"


def inline_cell(value, row, col, style_id=None):
    ref = cell_ref(col, row)
    resolved_style = 1 if row == 1 else style_id
    style = f' s="{resolved_style}"' if resolved_style is not None else ""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return f'<c r="{ref}"{style}><v>{value}</v></c>'
    text = "" if value is None else str(value)
    return f'<c r="{ref}"{style} t="inlineStr"><is><t xml:space="preserve">{escape(text)}</t></is></c>'


def make_sheet(rows, widths=None, row_styles=None):
    cols = ""
    if widths:
        cols = "<cols>" + "".join(
            f'<col min="{i}" max="{i}" width="{width}" customWidth="1"/>'
            for i, width in enumerate(widths, start=1)
        ) + "</cols>"

    sheet_rows = []
    for row_idx, row in enumerate(rows, start=1):
        style_id = row_styles[row_idx - 1] if row_styles and row_idx - 1 < len(row_styles) else None
        cells = "".join(inline_cell(value, row_idx, col_idx, style_id) for col_idx, value in enumerate(row, start=1))
        sheet_rows.append(f'<row r="{row_idx}">{cells}</row>')

    last_col = cell_ref(len(rows[0]) if rows else 1, 1).rstrip("1")
    last_row = max(1, len(rows))
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<dimension ref="A1:{last_col}{last_row}"/>'
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
        f"{cols}<sheetData>{''.join(sheet_rows)}</sheetData>"
        f'<autoFilter ref="A1:{last_col}{last_row}"/>'
        '</worksheet>'
    )


def write_xlsx(path, annotations, topics=None):
    headers = [
        "participant_id",
        "coder_id",
        "code",
        "quote",
        "description",
        "start_timestamp",
        "end_timestamp",
        "created_at",
    ]
    rows = [headers]
    for item in annotations:
        rows.append([
            participant_id(item.get("transcriptName", "")),
            item.get("coderId", ""),
            item.get("code", ""),
            item.get("quote", ""),
            item.get("memo", ""),
            format_timestamp(item.get("startTimeSec")),
            format_timestamp(item.get("endTimeSec")),
            item.get("createdAt", ""),
        ])

    code_summary = {}
    for item in annotations:
        code = str(item.get("code", "")).strip()
        if not code:
            continue
        summary = code_summary.setdefault(code, {"descriptions": [], "count": 0, "participants": set()})
        description = str(item.get("memo", "")).strip()
        if description and description not in summary["descriptions"]:
            summary["descriptions"].append(description)
        summary["count"] += 1
        participant = participant_id(item.get("transcriptName", ""))
        if participant:
            summary["participants"].add(participant)

    codebook_rows = [["code", "description", "occurrence_count", "unique_participant_count"]]
    for code in sorted(code_summary, key=str.casefold):
        summary = code_summary[code]
        codebook_rows.append([
            code,
            " | ".join(summary["descriptions"]),
            summary["count"],
            len(summary["participants"]),
        ])

    unique_codes = sorted(code_summary, key=str.casefold)
    code_style = {code: 2 + (index % len(PASTEL_CODE_COLORS)) for index, code in enumerate(unique_codes)}
    code_row_styles = [1] + [code_style.get(str(item.get("code", "")).strip()) for item in annotations]
    codebook_row_styles = [1] + [code_style[code] for code in unique_codes]

    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        '</Types>'
    )
    root_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        '</Relationships>'
    )
    workbook = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets>'
        '<sheet name="Codes" sheetId="1" r:id="rId1"/>'
        '<sheet name="Codebook" sheetId="2" r:id="rId2"/>'
        '</sheets></workbook>'
    )
    workbook_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        '</Relationships>'
    )
    pastel_fills = "".join(
        f'<fill><patternFill patternType="solid"><fgColor rgb="{color}"/><bgColor indexed="64"/></patternFill></fill>'
        for color in PASTEL_CODE_COLORS
    )
    pastel_xfs = "".join(
        f'<xf numFmtId="0" fontId="0" fillId="{3 + index}" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
        for index in range(len(PASTEL_CODE_COLORS))
    )
    styles = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font></fonts>'
        f'<fills count="{3 + len(PASTEL_CODE_COLORS)}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2F6F5E"/><bgColor indexed="64"/></patternFill></fill>{pastel_fills}</fills>'
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        f'<cellXfs count="{2 + len(PASTEL_CODE_COLORS)}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>{pastel_xfs}</cellXfs>'
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        '</styleSheet>'
    )

    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as workbook_zip:
        workbook_zip.writestr("[Content_Types].xml", content_types)
        workbook_zip.writestr("_rels/.rels", root_rels)
        workbook_zip.writestr("xl/workbook.xml", workbook)
        workbook_zip.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
        workbook_zip.writestr("xl/styles.xml", styles)
        workbook_zip.writestr("xl/worksheets/sheet1.xml", make_sheet(rows, [24, 18, 30, 72, 48, 18, 18, 24], code_row_styles))
        workbook_zip.writestr("xl/worksheets/sheet2.xml", make_sheet(codebook_rows, [30, 72, 20, 26], codebook_row_styles))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/session":
            self.handle_session()
            return
        if parsed.path == "/api/transcripts":
            self.handle_transcripts()
            return
        if parsed.path == "/api/recordings":
            self.handle_recordings()
            return
        if parsed.path == "/api/settings":
            self.handle_settings()
            return
        if parsed.path == "/api/recording":
            self.handle_recording_file(parsed)
            return
        super().do_GET()

    def handle_recording_file(self, parsed):
        relative = unquote(parse_qs(parsed.query).get("path", [""])[0])
        file_path = (RECORDINGS / relative).resolve()

        try:
            file_path.relative_to(RECORDINGS.resolve())
        except ValueError:
            self.send_error(403, "Forbidden")
            return

        if not file_path.exists() or not file_path.is_file():
            self.send_error(404, "File not found")
            return

        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        file_size = file_path.stat().st_size
        range_header = self.headers.get("Range", "")

        if range_header.startswith("bytes="):
            match = re.match(r"bytes=(\d*)-(\d*)", range_header)
            if not match:
                self.send_error(416, "Invalid range")
                return

            start_str, end_str = match.groups()
            if start_str == "" and end_str == "":
                self.send_error(416, "Invalid range")
                return

            if start_str == "":
                length = int(end_str)
                start = max(file_size - length, 0)
                end = file_size - 1
            else:
                start = int(start_str)
                end = int(end_str) if end_str else file_size - 1

            if start < 0 or end < start or start >= file_size:
                self.send_error(416, "Requested range not satisfiable")
                return

            end = min(end, file_size - 1)
            chunk_size = end - start + 1

            self.send_response(206)
            self.send_header("Content-Type", content_type)
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
            self.send_header("Content-Length", str(chunk_size))
            self.end_headers()

            with file_path.open("rb") as handle:
                handle.seek(start)
                self.wfile.write(handle.read(chunk_size))
            return

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(file_size))
        self.end_headers()
        with file_path.open("rb") as handle:
            self.wfile.write(handle.read())

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/export":
            self.handle_export()
            return
        if parsed.path == "/api/save":
            self.handle_save()
            return
        if parsed.path == "/api/generate-codes":
            self.handle_generate_codes()
            return
        if parsed.path == "/api/settings":
            self.handle_update_settings()
            return
        if parsed.path == "/api/refresh-recordings":
            self.handle_refresh_recordings()
            return
        self.send_error(404, "Not found")

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw or "{}")

    def handle_save(self):
        DATA.mkdir(exist_ok=True)
        EXPORTS.mkdir(exist_ok=True)
        payload = self.read_json()
        payload["savedAt"] = payload.get("savedAt") or datetime.now().isoformat()
        session_path = DATA / "coding_session.json"
        excel_path = EXPORTS / "coding_session_latest.xlsx"
        session_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        topics = payload.get("topics") or payload.get("categories") or DEFAULT_TOPICS
        write_xlsx(excel_path, payload.get("annotations", []), topics)
        self.send_json({
            "ok": True,
            "path": str(session_path),
            "excelPath": str(excel_path),
            "savedAt": payload["savedAt"],
        })

    def handle_session(self):
        path = DATA / "coding_session.json"
        if not path.exists():
            self.send_json({"exists": False})
            return

        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            self.send_json({"exists": False, "error": "Saved session could not be read."})
            return

        self.send_json({
            "exists": True,
            "savedAt": payload.get("savedAt", ""),
            "session": payload,
            "excelPath": str(EXPORTS / "coding_session_latest.xlsx"),
        })

    def handle_settings(self):
        self.send_json({
            "recordingsFolder": str(RECORDINGS),
            "defaultRecordingsFolder": str(DEFAULT_RECORDINGS),
            "openaiConfigured": bool(OPENAI_API_KEY),
            "deepgramConfigured": bool(DEEPGRAM_API_KEY),
        })

    def handle_update_settings(self):
        payload = self.read_json()
        try:
            apply_runtime_settings(payload)
        except (OSError, ValueError) as error:
            self.send_json({"ok": False, "error": f"Could not save settings: {error}"})
            return
        self.send_json({
            "ok": True,
            "recordingsFolder": str(RECORDINGS),
            "openaiConfigured": bool(OPENAI_API_KEY),
            "deepgramConfigured": bool(DEEPGRAM_API_KEY),
        })

    def handle_refresh_recordings(self):
        summary = ensure_transcripts_for_recordings()
        self.send_json({"ok": not summary.get("error"), "summary": summary})

    def handle_transcripts(self):
        # Keep transcript inventory in sync with recordings: new audio files
        # are auto-transcribed (when needed) before listing transcripts.
        ensure_transcripts_for_recordings()

        transcripts = []
        deepgram_files = []
        recording_stems = {path.stem for path in list_recording_audio_files()}
        if TRANSCRIPT_JSON_DIR.exists():
            deepgram_files = sorted(TRANSCRIPT_JSON_DIR.glob("*.deepgram.json"), key=transcript_sort_key)
            if recording_stems:
                deepgram_files = [path for path in deepgram_files if path.name.removesuffix(".deepgram.json") in recording_stems]

        if deepgram_files:
            for path in deepgram_files:
                transcripts.append(parse_deepgram_transcript(path))
        elif TRANSCRIPTS.exists():
            for path in sorted(TRANSCRIPTS.glob("*.txt"), key=transcript_sort_key):
                transcripts.append({
                    "id": f"folder:{path.name}",
                    "name": path.name,
                    "recordingStem": path.stem,
                    "text": path.read_text(encoding="utf-8-sig", errors="replace"),
                    "turns": [],
                    "source": "transcripts",
                })
        self.send_json({"transcripts": transcripts})

    def handle_recordings(self):
        recordings = []
        if RECORDINGS.exists():
            for path in sorted(RECORDINGS.rglob("*")):
                if not path.is_file() or path.suffix.lower() not in SUPPORTED_AUDIO_EXTENSIONS:
                    continue
                recordings_relative_path = path.relative_to(RECORDINGS).as_posix()
                recordings.append({
                    "id": f"recording:{recordings_relative_path}",
                    "name": path.name,
                    "recordingStem": path.stem,
                    "folder": str(path.parent),
                    "url": f"/api/recording?path={quote(recordings_relative_path)}",
                })
        self.send_json({"recordings": recordings})

    def handle_export(self):
        EXPORTS.mkdir(exist_ok=True)
        payload = self.read_json()
        annotations = payload.get("annotations", [])
        topics = payload.get("topics") or payload.get("categories") or DEFAULT_TOPICS
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = safe_filename(payload.get("projectName", "qualitative_coding")) + f"_{stamp}.xlsx"
        path = EXPORTS / filename
        write_xlsx(path, annotations, topics)

        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Saved-Path", str(path))
        self.end_headers()
        self.wfile.write(data)

    def handle_generate_codes(self):
        if not OPENAI_API_KEY:
            self.send_json({"ok": False, "error": "OPENAI_API_KEY is not set."})
            return

        payload = self.read_json()
        transcript_text = (payload.get("transcriptText") or "").strip()
        transcript_name = payload.get("transcriptName") or "current transcript"
        existing_codes = payload.get("existingCodes") or []
        selected_quote = (payload.get("selectedQuote") or "").strip()
        research_questions = (payload.get("researchQuestions") or "").strip()

        if not transcript_text:
            self.send_json({"ok": False, "error": "No transcript text was provided."})
            return
        if not research_questions:
            self.send_json({"ok": False, "error": "Research questions or hypotheses are required."})
            return

        prompt = {
            "transcript_name": transcript_name,
            "existing_codes": existing_codes,
            "selected_quote": selected_quote,
            "research_questions_or_hypotheses": research_questions,
            "transcript_text": transcript_text[:24000],
        }

        system_prompt = (
            "You are helping with reflexive thematic analysis (Braun & Clarke). "
            "Systematically identify features of the interview data that are relevant to the supplied research questions or hypotheses. "
            "Generate concise initial codes directly grounded in the interview text. "
            "Codes may be semantic, capturing what participants explicitly say, or latent, interpreting underlying assumptions, ideas, or meanings. "
            "Use semantic codes when explicit content is analytically relevant and latent codes only when the interpretation is supported by the evidence. "
            "Across the suggestions, consider both levels rather than forcing every excerpt into both. In each rationale, identify the code as semantic or latent and explain its relevance to a research question or hypothesis. "
            "Return JSON only, with this exact shape: {\"suggestions\": [{\"code\": string, \"rationale\": string, \"evidence\": string}]} . "
            "Keep code labels short and descriptive, reuse an existing code label whenever it fits the evidence, avoid unnecessary new labels, and focus on what the participant is expressing. "
            "If none of the existing code labels fit the evidence, create a new code label. "
            "Also evaluate whether the transcript contains each of these exact labels: 'Postive example' and 'Negative example'. "
            "If evidence exists for either one, include it in suggestions and put a short direct quote in evidence."
        )
        user_prompt = json.dumps(prompt, ensure_ascii=False, indent=2)

        request_body = json.dumps({
            "model": OPENAI_MODEL,
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "qual_code_suggestions",
                    "schema": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "suggestions": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "additionalProperties": False,
                                    "properties": {
                                        "code": {"type": "string"},
                                        "rationale": {"type": "string"},
                                        "evidence": {"type": "string"}
                                    },
                                    "required": ["code", "rationale", "evidence"]
                                }
                            }
                        },
                        "required": ["suggestions"]
                    },
                    "strict": True
                }
            },
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }).encode("utf-8")

        request = Request(
            "https://api.openai.com/v1/chat/completions",
            data=request_body,
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        max_attempts = max(1, OPENAI_REQUEST_RETRIES + 1)
        raw = None
        last_error = None

        for attempt in range(1, max_attempts + 1):
            try:
                with urlopen(request, timeout=OPENAI_REQUEST_TIMEOUT_SEC, context=SSL_CONTEXT) as response:
                    raw = response.read().decode("utf-8")
                break
            except HTTPError as error:
                body = error.read().decode("utf-8", errors="replace")
                last_error = f"HTTP {error.code}: {body}"
                if not should_retry_http_error(error) or attempt >= max_attempts:
                    self.send_json({"ok": False, "error": f"OpenAI request failed: {last_error}"})
                    return
            except (URLError, TimeoutError, socket.timeout) as error:
                last_error = str(getattr(error, "reason", error))
                if not is_timeout_error(error) or attempt >= max_attempts:
                    self.send_json({
                        "ok": False,
                        "error": (
                            "OpenAI request failed: "
                            f"{last_error}. "
                            "If this is a certificate error, set CA_BUNDLE_PATH in the repository's .env file "
                            "(for macOS usually /etc/ssl/cert.pem)."
                        ),
                    })
                    return

            backoff_seconds = 1.2 * attempt
            print(f"OpenAI request attempt {attempt}/{max_attempts} failed; retrying in {backoff_seconds:.1f}s")
            time.sleep(backoff_seconds)

        if raw is None:
            self.send_json({"ok": False, "error": f"OpenAI request failed after retries: {last_error or 'unknown error'}"})
            return

        try:
            response_payload = json.loads(raw)
            content = response_payload["choices"][0]["message"]["content"]
            if not isinstance(content, str):
                raise ValueError("OpenAI content was not text.")
            parsed = parse_json_response(content)
            suggestions = normalize_suggestions(parsed.get("suggestions", []))
        except (KeyError, IndexError, TypeError, json.JSONDecodeError, ValueError) as error:
            self.send_json({"ok": False, "error": f"Could not parse OpenAI response: {error}"})
            return

        self.send_json({"ok": True, "suggestions": suggestions})

    def send_json(self, value):
        data = json.dumps(value).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    mimetypes.add_type("text/javascript", ".js")
    ensure_transcripts_for_recordings()
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Local Qual Coding Desk running at http://127.0.0.1:{port}")
    print("Press Ctrl+C to stop.")
    server.serve_forever()


if __name__ == "__main__":
    main()
