from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from difflib import SequenceMatcher
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlencode, urlparse
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import os
import base64
import json
import io
import mimetypes
import re
import socket
import ssl
import sys
import time
import zipfile
import xml.etree.ElementTree as ET
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
OPENAI_ALIGNMENT_TIMEOUT_SEC = int(os.environ.get("OPENAI_ALIGNMENT_TIMEOUT_SEC", LOCAL_ENV.get("OPENAI_ALIGNMENT_TIMEOUT_SEC", "25") or "25"))
OPENAI_ALIGNMENT_RETRIES = int(os.environ.get("OPENAI_ALIGNMENT_RETRIES", LOCAL_ENV.get("OPENAI_ALIGNMENT_RETRIES", "0") or "0"))
OPENAI_EMBEDDING_MODEL = os.environ.get("OPENAI_EMBEDDING_MODEL", LOCAL_ENV.get("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")).strip() or "text-embedding-3-small"
OPENAI_ALIGNMENT_SIMILARITY = float(os.environ.get("OPENAI_ALIGNMENT_SIMILARITY", LOCAL_ENV.get("OPENAI_ALIGNMENT_SIMILARITY", "0.66") or "0.66"))
OPENAI_WITHIN_CODER_SIMILARITY = float(os.environ.get("OPENAI_WITHIN_CODER_SIMILARITY", LOCAL_ENV.get("OPENAI_WITHIN_CODER_SIMILARITY", "0.78") or "0.78"))

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

XLSX_NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def read_first_sheet_xlsx(raw_bytes):
    """Read the first worksheet without third-party packages."""
    try:
        with zipfile.ZipFile(io.BytesIO(raw_bytes)) as archive:
            shared = []
            if "xl/sharedStrings.xml" in archive.namelist():
                root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
                shared = ["".join(node.itertext()) for node in root.findall("x:si", XLSX_NS)]
            sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
    except (KeyError, zipfile.BadZipFile, ET.ParseError) as error:
        raise ValueError(f"Could not read the Excel workbook: {error}") from error

    table = []
    for row in sheet.findall(".//x:sheetData/x:row", XLSX_NS):
        values = []
        for cell in row.findall("x:c", XLSX_NS):
            cell_type = cell.get("t")
            if cell_type == "inlineStr":
                value = "".join(cell.itertext())
            else:
                value_node = cell.find("x:v", XLSX_NS)
                value = value_node.text if value_node is not None else ""
                if cell_type == "s" and value:
                    value = shared[int(value)]
            values.append(value)
        table.append(values)
    if not table:
        raise ValueError("The first worksheet is empty.")
    headers = [str(value).strip() for value in table[0]]
    return [dict(zip(headers, row + [""] * (len(headers) - len(row)))) for row in table[1:]]


def read_codes_xlsx(raw_bytes):
    """Read the Codes sheet produced by QualCodeDesk without third-party packages."""
    rows = read_first_sheet_xlsx(raw_bytes)
    headers = set(rows[0]) if rows else set()
    required = {"participant_id", "coder_id", "code"}
    if not required.issubset(headers):
        raise ValueError("Expected a QualCodeDesk Codes sheet with participant_id, coder_id, and code columns.")
    return rows


def summarize_coder_rows(rows):
    codes = {}
    participants = set()
    coders = set()
    for row in rows:
        code = str(row.get("code", "")).strip()
        pid = str(row.get("participant_id", "")).strip()
        coder = str(row.get("coder_id", "")).strip()
        if not code or not pid:
            continue
        participants.add(pid)
        if coder:
            coders.add(coder)
        item = codes.setdefault(code, {"code": code, "participants": set(), "count": 0, "descriptions": set()})
        item["participants"].add(pid)
        item["count"] += 1
        description = str(row.get("description", "")).strip()
        if description:
            item["descriptions"].add(description)
    output = []
    for item in codes.values():
        output.append({
            "code": item["code"],
            "participants": sorted(item["participants"]),
            "count": item["count"],
            "description": " | ".join(sorted(item["descriptions"])),
        })
    return sorted(output, key=lambda item: item["code"].casefold()), sorted(participants), sorted(coders)


def workbook_row_signatures(rows):
    return {
        (
            str(row.get("participant_id", "")).strip(),
            str(row.get("coder_id", "")).strip(),
            str(row.get("code", "")).strip(),
            str(row.get("quote", "")).strip(),
        )
        for row in rows
        if str(row.get("code", "")).strip()
    }


def code_similarity(left, right):
    def words(value):
        return set(re.findall(r"[a-z0-9]+", value.casefold()))
    left_words, right_words = words(left), words(right)
    union = left_words | right_words
    jaccard = len(left_words & right_words) / len(union) if union else 0
    sequence = SequenceMatcher(None, left.casefold(), right.casefold()).ratio()
    return max(jaccard, sequence)


CODE_TOKEN_ALIASES = {
    "causal": "casual",
    "convo": "conversation",
    "convos": "conversation",
    "conversations": "conversation",
    "factcheck": "fact-check",
    "factchecks": "fact-check",
    "factchecking": "fact-check",
}
CODE_FILLER_TOKENS = {"code", "issue", "issues", "related", "thing", "things"}
NEGATIVE_CODE_TOKENS = {"no", "not", "never", "without", "unacceptable", "uncomfortable", "inaccurate", "incorrect", "useless", "distrust"}
POSITIVE_CODE_TOKENS = {"acceptable", "comfortable", "accurate", "correct", "useful", "trust", "trusted"}


def normalized_code_tokens(value, remove_fillers=False):
    raw_tokens = re.findall(r"[a-z0-9]+", str(value).casefold())
    tokens = []
    for token in raw_tokens:
        token = CODE_TOKEN_ALIASES.get(token, token)
        if remove_fillers and token in CODE_FILLER_TOKENS:
            continue
        token = stemToken_for_code(token)
        if remove_fillers and token in CODE_FILLER_TOKENS:
            continue
        tokens.append(token)
    return tokens


def stemToken_for_code(token):
    if len(token) > 5 and token.endswith("ing") and token not in {"thing"}:
        return token[:-3]
    if len(token) > 4 and token.endswith("ed"):
        return token[:-2]
    if len(token) > 4 and token.endswith("es"):
        return token[:-2]
    if len(token) > 3 and token.endswith("s"):
        return token[:-1]
    return token


def code_polarity(value):
    tokens = set(normalized_code_tokens(value))
    negative = bool(tokens & NEGATIVE_CODE_TOKENS) or "didn't" in str(value).casefold() or "wasn't" in str(value).casefold() or "won't" in str(value).casefold()
    positive = bool(tokens & POSITIVE_CODE_TOKENS)
    return negative, positive


def lightweight_code_match(left, right):
    """Only accept near-duplicate code wording, not broader topical similarity."""
    left_negative, left_positive = code_polarity(left)
    right_negative, right_positive = code_polarity(right)
    if (left_negative and right_positive and not right_negative) or (right_negative and left_positive and not left_negative):
        return False, 0

    left_tokens = normalized_code_tokens(left, remove_fillers=True)
    right_tokens = normalized_code_tokens(right, remove_fillers=True)
    if not left_tokens or not right_tokens:
        return False, 0
    left_set, right_set = set(left_tokens), set(right_tokens)
    overlap = len(left_set & right_set)
    containment = overlap / min(len(left_set), len(right_set))
    union = len(left_set | right_set)
    jaccard = overlap / union if union else 0
    sequence = SequenceMatcher(None, " ".join(left_tokens), " ".join(right_tokens)).ratio()

    exact_core = left_set == right_set
    short_containment = containment == 1 and abs(len(left_set) - len(right_set)) <= 1 and overlap >= 2
    close_wording = jaccard >= 0.72 and sequence >= 0.72
    accepted = exact_core or short_containment or close_wording
    return accepted, round(max(jaccard, sequence, containment if short_containment else 0), 2) if accepted else 0


def deterministic_code_groups(codes_a, codes_b):
    def cluster_one_coder(codes):
        clusters = []
        for item in sorted(codes, key=lambda value: (-len(value["code"]), value["code"].casefold())):
            best_index, best_score = None, 0
            for index, cluster in enumerate(clusters):
                matches = [lightweight_code_match(item["code"], member["code"]) for member in cluster]
                # Complete-link clustering: a new label must resemble every
                # member, preventing a chain of weak bridges from swallowing
                # the entire codebook.
                score = min((value for accepted, value in matches if accepted), default=0)
                if all(accepted for accepted, value in matches) and score > best_score:
                    best_index, best_score = index, score
            if best_index is None:
                clusters.append([item])
            else:
                clusters[best_index].append(item)
        return clusters

    clusters_a = cluster_one_coder(codes_a)
    clusters_b = cluster_one_coder(codes_b)
    candidates = []
    for index_a, cluster_a in enumerate(clusters_a):
        for index_b, cluster_b in enumerate(clusters_b):
            matches = [lightweight_code_match(left["code"], right["code"]) for left in cluster_a for right in cluster_b]
            exact_match = bool({item["code"].casefold() for item in cluster_a} & {item["code"].casefold() for item in cluster_b})
            score = max((value for accepted, value in matches if accepted), default=0)
            if exact_match or score > 0:
                candidates.append((1 if exact_match else score, score, index_a, index_b))

    paired_a, paired_b, paired = set(), set(), []
    for priority, score, index_a, index_b in sorted(candidates, reverse=True):
        if index_a in paired_a or index_b in paired_b:
            continue
        paired_a.add(index_a); paired_b.add(index_b)
        paired.append((clusters_a[index_a], clusters_b[index_b], score))
    paired.extend((cluster, [], 0) for index, cluster in enumerate(clusters_a) if index not in paired_a)
    paired.extend(([], cluster, 0) for index, cluster in enumerate(clusters_b) if index not in paired_b)

    groups = []
    for members_a, members_b, similarity in paired:
        codes_a_group = sorted((item["code"] for item in members_a), key=str.casefold)
        codes_b_group = sorted((item["code"] for item in members_b), key=str.casefold)
        participants_a = set().union(*(set(item["participants"]) for item in members_a)) if members_a else set()
        participants_b = set().union(*(set(item["participants"]) for item in members_b)) if members_b else set()
        label = (codes_a_group + codes_b_group)[0]
        member_count = len(members_a) + len(members_b)
        groups.append({
            "codesA": codes_a_group,
            "codesB": codes_b_group,
            "label": label,
            "similarity": round(similarity, 2),
            "participantOverlap": sorted(participants_a & participants_b),
            "reason": "Grouped by similar labels, including related labels used by the same coder." if member_count > 1 else f"Only in coder {'A' if members_a else 'B'} workbook.",
        })
    return sorted(groups, key=lambda group: group["label"].casefold())


def embedding_code_groups(codes_a, codes_b):
    if not OPENAI_API_KEY:
        raise ValueError("OpenAI is not configured. Add an API key in Settings or turn off semantic alignment.")
    if not codes_a or not codes_b:
        return deterministic_code_groups(codes_a, codes_b)

    all_codes = codes_a + codes_b
    inputs = [f"Qualitative code: {item['code']}. Description: {item.get('description', '')[:160]}" for item in all_codes]
    body = json.dumps({"model": OPENAI_EMBEDDING_MODEL, "input": inputs, "encoding_format": "float"}).encode("utf-8")
    request = Request(
        "https://api.openai.com/v1/embeddings",
        data=body,
        headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=OPENAI_ALIGNMENT_TIMEOUT_SEC, context=SSL_CONTEXT) as response:
            payload = json.loads(response.read().decode("utf-8"))
        vectors = [item["embedding"] for item in sorted(payload["data"], key=lambda item: item["index"])]
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise ValueError(f"OpenAI embeddings failed (HTTP {error.code}): {detail}") from error
    except (URLError, TimeoutError, socket.timeout, KeyError, TypeError, json.JSONDecodeError) as error:
        raise ValueError(f"OpenAI embeddings failed: {getattr(error, 'reason', error)}") from error
    if len(vectors) != len(all_codes):
        raise ValueError("OpenAI embeddings returned an unexpected number of results.")

    def cosine(left, right):
        dot = sum(a * b for a, b in zip(left, right))
        left_norm = sum(value * value for value in left) ** 0.5
        right_norm = sum(value * value for value in right) ** 0.5
        return dot / (left_norm * right_norm) if left_norm and right_norm else 0

    vectors_a = vectors[:len(codes_a)]
    vectors_b = vectors[len(codes_a):]

    def polarity_conflict(left_code, right_code):
        left_negative, left_positive = code_polarity(left_code)
        right_negative, right_positive = code_polarity(right_code)
        return (left_negative and right_positive and not right_negative) or (right_negative and left_positive and not left_negative)

    def cluster_within_coder(codes, code_vectors):
        clusters = []
        for item_index in sorted(range(len(codes)), key=lambda index: (-codes[index].get("count", 0), codes[index]["code"].casefold())):
            best_cluster, best_score = None, -1
            for cluster_index, member_indices in enumerate(clusters):
                comparisons = [
                    cosine(code_vectors[item_index], code_vectors[member_index])
                    for member_index in member_indices
                    if not polarity_conflict(codes[item_index]["code"], codes[member_index]["code"])
                ]
                if len(comparisons) != len(member_indices):
                    continue
                # Complete-link semantic clustering prevents transitive chains:
                # the new code must be similar to every existing member.
                score = min(comparisons)
                if score >= OPENAI_WITHIN_CODER_SIMILARITY and score > best_score:
                    best_cluster, best_score = cluster_index, score
            if best_cluster is None:
                clusters.append([item_index])
            else:
                clusters[best_cluster].append(item_index)
        return clusters

    def centroid(member_indices, code_vectors):
        dimensions = len(code_vectors[member_indices[0]])
        return [sum(code_vectors[index][dimension] for index in member_indices) / len(member_indices) for dimension in range(dimensions)]

    def cluster_cohesion(member_indices, code_vectors):
        if len(member_indices) < 2:
            return 0
        return min(
            cosine(code_vectors[left], code_vectors[right])
            for position, left in enumerate(member_indices)
            for right in member_indices[position + 1:]
        )

    clusters_a = cluster_within_coder(codes_a, vectors_a)
    clusters_b = cluster_within_coder(codes_b, vectors_b)
    centroids_a = [centroid(cluster, vectors_a) for cluster in clusters_a]
    centroids_b = [centroid(cluster, vectors_b) for cluster in clusters_b]
    candidates = []
    for index_a, cluster_a in enumerate(clusters_a):
        for index_b, cluster_b in enumerate(clusters_b):
            participants_a = set().union(*(set(codes_a[index]["participants"]) for index in cluster_a))
            participants_b = set().union(*(set(codes_b[index]["participants"]) for index in cluster_b))
            if not participants_a & participants_b:
                continue
            if any(polarity_conflict(codes_a[left]["code"], codes_b[right]["code"]) for left in cluster_a for right in cluster_b):
                continue
            score = cosine(centroids_a[index_a], centroids_b[index_b])
            if score >= OPENAI_ALIGNMENT_SIMILARITY:
                candidates.append((score, index_a, index_b))

    # Mutual-best filtering avoids pairing two codes just because both concern
    # the same broad topic. Each must be the other's strongest available match.
    best_for_a = {}
    best_for_b = {}
    for score, index_a, index_b in candidates:
        if score > best_for_a.get(index_a, (-1, None))[0]: best_for_a[index_a] = (score, index_b)
        if score > best_for_b.get(index_b, (-1, None))[0]: best_for_b[index_b] = (score, index_a)

    used_a, used_b, groups = set(), set(), []
    for score, index_a, index_b in sorted(candidates, reverse=True):
        if index_a in used_a or index_b in used_b:
            continue
        if best_for_a.get(index_a, (None, None))[1] != index_b or best_for_b.get(index_b, (None, None))[1] != index_a:
            continue
        used_a.add(index_a); used_b.add(index_b)
        members_a = [codes_a[index] for index in clusters_a[index_a]]
        members_b = [codes_b[index] for index in clusters_b[index_b]]
        labels_a = sorted((item["code"] for item in members_a), key=str.casefold)
        labels_b = sorted((item["code"] for item in members_b), key=str.casefold)
        participants_a = set().union(*(set(item["participants"]) for item in members_a))
        participants_b = set().union(*(set(item["participants"]) for item in members_b))
        shortest_label = min(labels_a + labels_b, key=len)
        groups.append({
            "codesA": labels_a, "codesB": labels_b,
            "label": shortest_label,
            "similarity": round(score, 2),
            "participantOverlap": sorted(participants_a & participants_b),
            "reason": "Semantic clusters within coders, then mutual-best cross-coder alignment.",
        })

    for cluster_index, member_indices in enumerate(clusters_a):
        if cluster_index in used_a:
            continue
        members = [codes_a[index] for index in member_indices]
        labels = sorted((item["code"] for item in members), key=str.casefold)
        groups.append({"codesA": labels, "codesB": [], "label": min(labels, key=len), "similarity": round(cluster_cohesion(member_indices, vectors_a), 2), "participantOverlap": [], "reason": "Semantically similar codes within coder A." if len(labels) > 1 else "Only in coder A workbook."})
    for cluster_index, member_indices in enumerate(clusters_b):
        if cluster_index in used_b:
            continue
        members = [codes_b[index] for index in member_indices]
        labels = sorted((item["code"] for item in members), key=str.casefold)
        groups.append({"codesA": [], "codesB": labels, "label": min(labels, key=len), "similarity": round(cluster_cohesion(member_indices, vectors_b), 2), "participantOverlap": [], "reason": "Semantically similar codes within coder B." if len(labels) > 1 else "Only in coder B workbook."})
    return sorted(groups, key=lambda group: group["label"].casefold())


def gpt_code_groups(codes_a, codes_b):
    if not OPENAI_API_KEY:
        raise ValueError("OpenAI is not configured. Add an API key in Settings or turn off GPT-assisted alignment.")
    if not codes_a or not codes_b:
        return deterministic_code_groups(codes_a, codes_b)
    def compact_codes(codes):
        return [{
            "code": item["code"],
            "description": item.get("description", "")[:120],
            "occurrence_count": item.get("count", 0),
        } for item in codes]

    system_prompt = "Find only high-confidence equivalent codes across two granular qualitative codebooks. Labels may use different words but must express the same specific meaning at the same level of granularity. Example: 'Battery drains quickly' and 'battery life was low' may match. Do not match merely because codes share a broader topic. Never match positive with negative, acceptable with unacceptable, comfortable with uncomfortable, accurate with inaccurate, useful with not useful, trust with distrust, or any opposing meanings. Every returned group must contain at least one code from each coder. Omit unmatched codes entirely; do not return singleton groups. Use each input code at most once. Return only exact input labels in codesA and codesB; invent no source labels. Prefer one code per coder unless true wording variants exist. Similarity must be 0 to 1 and at least 0.78. Keep each reason under 12 words."
    schema = {"type": "object", "additionalProperties": False, "properties": {
        "groups": {"type": "array", "items": {"type": "object", "additionalProperties": False, "properties": {
            "codesA": {"type": "array", "items": {"type": "string"}}, "codesB": {"type": "array", "items": {"type": "string"}}, "label": {"type": "string"},
            "similarity": {"type": "number"}, "reason": {"type": "string"}
        }, "required": ["codesA", "codesB", "label", "similarity", "reason"]}}
    }, "required": ["groups"]}

    def request_batch(batch_a, batch_b):
        prompt = json.dumps({"coder_a_codes": compact_codes(batch_a), "coder_b_codes": compact_codes(batch_b)}, ensure_ascii=False)
        body = json.dumps({
            "model": OPENAI_MODEL,
            "response_format": {"type": "json_schema", "json_schema": {"name": "code_alignment", "strict": True, "schema": schema}},
            "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": prompt}],
        }).encode("utf-8")
        last_error = None
        for attempt in range(1, max(1, OPENAI_ALIGNMENT_RETRIES + 1) + 1):
            request = Request("https://api.openai.com/v1/chat/completions", data=body, headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}, method="POST")
            try:
                with urlopen(request, timeout=OPENAI_ALIGNMENT_TIMEOUT_SEC, context=SSL_CONTEXT) as response:
                    response_data = json.loads(response.read().decode("utf-8"))
                return parse_json_response(response_data["choices"][0]["message"]["content"])
            except HTTPError as error:
                last_error = f"HTTP {error.code}: {error.read().decode('utf-8', errors='replace')}"
                if not should_retry_http_error(error): break
            except (URLError, TimeoutError, socket.timeout, KeyError, IndexError, json.JSONDecodeError) as error:
                last_error = str(getattr(error, "reason", error))
            if attempt < max(1, OPENAI_ALIGNMENT_RETRIES + 1): time.sleep(1.2 * attempt)
        raise ValueError(last_error or "unknown GPT batch error")

    shared_participants = sorted(set().union(*(set(item["participants"]) for item in codes_a)) & set().union(*(set(item["participants"]) for item in codes_b)))
    tasks = []
    for participant in shared_participants:
        participant_a = [item for item in codes_a if participant in item["participants"]]
        participant_b = [item for item in codes_b if participant in item["participants"]]
        for start in range(0, len(participant_b), 30):
            tasks.append((participant_a, participant_b[start:start + 30]))
    if not tasks:
        tasks = [(codes_a, codes_b[start:start + 30]) for start in range(0, len(codes_b), 30)]

    proposed_groups = []
    successful_batches = 0
    with ThreadPoolExecutor(max_workers=min(6, len(tasks))) as executor:
        futures = [executor.submit(request_batch, batch_a, batch_b) for batch_a, batch_b in tasks]
        for future in as_completed(futures):
            try:
                proposed_groups.extend(future.result().get("groups", []))
                successful_batches += 1
            except ValueError:
                continue
    if not successful_batches:
        raise ValueError("All GPT alignment batches timed out or failed.")

    by_a = {item["code"]: item for item in codes_a}; by_b = {item["code"]: item for item in codes_b}
    used_a, used_b, groups = set(), set(), []
    for group in sorted(proposed_groups, key=lambda item: float(item.get("similarity", 0)), reverse=True):
        group_a = [code for code in group.get("codesA", []) if code in by_a and code not in used_a]
        group_b = [code for code in group.get("codesB", []) if code in by_b and code not in used_b]
        if not group_a or not group_b or len(group_a) > 3 or len(group_b) > 3:
            continue
        combined_codes = group_a + group_b
        if any(
            code_polarity(combined_codes[left])[0] != code_polarity(combined_codes[right])[0]
            and (code_polarity(combined_codes[left])[1] or code_polarity(combined_codes[right])[1])
            for left in range(len(combined_codes))
            for right in range(left + 1, len(combined_codes))
        ):
            # Reject polarity-conflicting GPT clusters. Their codes remain
            # available for the conservative deterministic pass below.
            continue
        reported_similarity = max(0, min(1, float(group.get("similarity", 0))))
        if reported_similarity < 0.78:
            continue
        used_a.update(group_a); used_b.update(group_b)
        participants_a = set().union(*(set(by_a[code]["participants"]) for code in group_a)) if group_a else set()
        participants_b = set().union(*(set(by_b[code]["participants"]) for code in group_b)) if group_b else set()
        groups.append({
            "codesA": group_a, "codesB": group_b, "label": str(group.get("label") or (group_a + group_b)[0]).strip(),
            "similarity": reported_similarity,
            "participantOverlap": sorted(participants_a & participants_b),
            "reason": str(group.get("reason", "GPT-assisted semantic cluster")).strip(),
        })
    remaining_a = [item for code, item in by_a.items() if code not in used_a]
    remaining_b = [item for code, item in by_b.items() if code not in used_b]
    groups.extend(deterministic_code_groups(remaining_a, remaining_b))
    return groups


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


def make_single_sheet_xlsx(rows, sheet_name="Themes", widths=None):
    """Create a compact one-sheet workbook using the app's existing XML writer."""
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
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
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<sheets><sheet name="{escape(sheet_name)}" sheetId="1" r:id="rId1"/></sheets></workbook>'
    )
    workbook_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        '</Relationships>'
    )
    styles = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font></fonts>'
        '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2F6F5E"/><bgColor indexed="64"/></patternFill></fill></fills>'
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf></cellXfs>'
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        '</styleSheet>'
    )
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as workbook_zip:
        workbook_zip.writestr("[Content_Types].xml", content_types)
        workbook_zip.writestr("_rels/.rels", root_rels)
        workbook_zip.writestr("xl/workbook.xml", workbook)
        workbook_zip.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
        workbook_zip.writestr("xl/styles.xml", styles)
        workbook_zip.writestr("xl/worksheets/sheet1.xml", make_sheet(rows, widths))
    return output.getvalue()


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
        if parsed.path == "/api/compare-codebooks":
            self.handle_compare_codebooks()
            return
        if parsed.path == "/api/theme-workbooks":
            self.handle_theme_workbooks()
            return
        if parsed.path == "/api/export-themes":
            self.handle_export_themes()
            return
        if parsed.path == "/api/load-theme-workbook":
            self.handle_load_theme_workbook()
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

    def handle_compare_codebooks(self):
        payload = self.read_json()
        try:
            raw_a = base64.b64decode(payload.get("workbookA", ""), validate=True)
            raw_b = base64.b64decode(payload.get("workbookB", ""), validate=True)
            rows_a = read_codes_xlsx(raw_a)
            rows_b = read_codes_xlsx(raw_b)
            codes_a, participants_a, coders_a = summarize_coder_rows(rows_a)
            codes_b, participants_b, coders_b = summarize_coder_rows(rows_b)
            signatures_a = workbook_row_signatures(rows_a)
            signatures_b = workbook_row_signatures(rows_b)
            shared_signatures = signatures_a & signatures_b
            smaller_signature_count = min(len(signatures_a), len(signatures_b))
            row_overlap = len(shared_signatures) / smaller_signature_count if smaller_signature_count else 0
            use_gpt = bool(payload.get("useGpt"))
        except (ValueError, TypeError) as error:
            self.send_json({"ok": False, "error": str(error)})
            return
        shared_participants = sorted(set(participants_a) & set(participants_b))
        all_participants = shared_participants + sorted((set(participants_a) | set(participants_b)) - set(shared_participants))

        def compare_participant(participant):
            participant_rows_a = [row for row in rows_a if str(row.get("participant_id", "")).strip() == participant]
            participant_rows_b = [row for row in rows_b if str(row.get("participant_id", "")).strip() == participant]
            participant_codes_a = summarize_coder_rows(participant_rows_a)[0]
            participant_codes_b = summarize_coder_rows(participant_rows_b)[0]
            method = "local"
            fallback_reason = ""
            if use_gpt and participant_codes_a and participant_codes_b:
                try:
                    groups = embedding_code_groups(participant_codes_a, participant_codes_b)
                    method = "gpt"
                except ValueError as error:
                    groups = deterministic_code_groups(participant_codes_a, participant_codes_b)
                    method = "local_fallback"
                    fallback_reason = str(error)
            else:
                groups = deterministic_code_groups(participant_codes_a, participant_codes_b)
            return {
                "participantId": participant,
                "participantStatus": "shared" if participant in shared_participants else ("a_only" if participant in participants_a else "b_only"),
                "codesA": participant_codes_a,
                "codesB": participant_codes_b,
                "groups": groups,
                "method": method,
                "fallbackReason": fallback_reason,
            }

        participant_comparisons = []
        if all_participants:
            with ThreadPoolExecutor(max_workers=min(5, len(all_participants))) as executor:
                futures = {executor.submit(compare_participant, participant): participant for participant in all_participants}
                completed = {}
                for future in as_completed(futures):
                    result = future.result()
                    completed[result["participantId"]] = result
            participant_comparisons = [completed[participant] for participant in all_participants]
        self.send_json({
            "ok": True,
            "coderA": ", ".join(coders_a) or "Coder A",
            "coderB": ", ".join(coders_b) or "Coder B",
            "participantsA": participants_a,
            "participantsB": participants_b,
            "sharedParticipants": shared_participants,
            "onlyParticipantsA": sorted(set(participants_a) - set(participants_b)),
            "onlyParticipantsB": sorted(set(participants_b) - set(participants_a)),
            "rowOverlap": round(row_overlap, 3),
            "workbooksIdentical": signatures_a == signatures_b,
            "mixedCoderWarning": len(coders_a) > 1 or len(coders_b) > 1,
            "participantComparisons": participant_comparisons,
        })

    def handle_theme_workbooks(self):
        payload = self.read_json()
        workbooks = payload.get("workbooks") or []
        if not isinstance(workbooks, list) or not workbooks:
            self.send_json({"ok": False, "error": "Choose at least one QualCodeDesk Excel workbook."})
            return
        aggregated = {}
        loaded_files = []
        try:
            for index, workbook in enumerate(workbooks):
                filename = str(workbook.get("name") or f"Workbook {index + 1}")
                raw = base64.b64decode(workbook.get("data", ""), validate=True)
                rows = read_codes_xlsx(raw)
                loaded_files.append(filename)
                for row in rows:
                    code = str(row.get("code", "")).strip()
                    if not code:
                        continue
                    key = code.casefold()
                    item = aggregated.setdefault(key, {
                        "code": code,
                        "count": 0,
                        "participants": set(),
                        "quotes": [],
                    })
                    participant_id = str(row.get("participant_id", "")).strip()
                    quote = str(row.get("quote", "")).strip()
                    item["count"] += 1
                    if participant_id:
                        item["participants"].add(participant_id)
                    item["quotes"].append({
                        "participantId": participant_id,
                        "quote": quote,
                        "coderId": str(row.get("coder_id", "")).strip(),
                        "description": str(row.get("description", "")).strip(),
                        "workbook": filename,
                    })
        except (ValueError, TypeError) as error:
            self.send_json({"ok": False, "error": str(error)})
            return
        codes = []
        for item in aggregated.values():
            item["participants"] = sorted(item["participants"])
            codes.append(item)
        codes.sort(key=lambda item: item["code"].casefold())
        self.send_json({"ok": True, "files": loaded_files, "codes": codes})

    def handle_export_themes(self):
        payload = self.read_json()
        source_rows = payload.get("rows") or []
        if not isinstance(source_rows, list) or not source_rows:
            self.send_json({"ok": False, "error": "There are no codes to export."})
            return
        rows = [[
            "record_type",
            "theme",
            "group_path",
            "group",
            "code",
            "code_quote_count",
            "participant_id",
            "quote",
            "coder_id",
            "source_workbook",
            "theme_id",
            "theme_name",
            "parent_theme_id",
            "theme_x",
            "theme_y",
            "theme_width",
            "theme_height",
            "code_id",
            "code_x",
            "code_y",
            "group_id",
        ]]
        for theme in payload.get("themes") or []:
            rows.append([
                "theme", "", "", "", "", "", "", "", "", "",
                theme.get("id", ""), theme.get("name", ""), theme.get("parentId", ""), theme.get("x", ""), theme.get("y", ""), theme.get("width", ""), theme.get("height", ""),
                "", "", "", "",
            ])
        for item in source_rows:
            rows.append([
                item.get("recordType", "code_evidence"),
                item.get("theme", ""),
                item.get("groupPath", ""),
                item.get("group", ""),
                item.get("code", ""),
                item.get("codeQuoteCount", 0),
                item.get("participantId", ""),
                item.get("quote", ""),
                item.get("coderId", ""),
                item.get("sourceWorkbook", ""),
                "", "", "", "", "", "", "",
                item.get("codeId", ""),
                item.get("codeX", ""),
                item.get("codeY", ""),
                item.get("groupId", ""),
            ])
        data = make_single_sheet_xlsx(rows, "Themes", [16, 28, 48, 28, 36, 18, 18, 80, 18, 34, 22, 30, 22, 14, 14, 16, 16, 22, 14, 14, 22])
        filename = f"qualcodedesk_themes_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        self.send_response(200)
        self.send_header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def handle_load_theme_workbook(self):
        payload = self.read_json()
        try:
            raw = base64.b64decode(payload.get("workbook", ""), validate=True)
            rows = read_first_sheet_xlsx(raw)
        except (ValueError, TypeError) as error:
            self.send_json({"ok": False, "error": str(error)})
            return
        if not rows or "code" not in rows[0]:
            self.send_json({"ok": False, "error": "Expected a Stage 3 theme workbook with theme, group, code, and quote columns."})
            return

        def number(value, fallback=None):
            try:
                return float(value)
            except (TypeError, ValueError):
                return fallback

        themes = {}
        for row in rows:
            if str(row.get("record_type", "")).strip() != "theme":
                continue
            theme_id = str(row.get("theme_id", "")).strip()
            if theme_id:
                themes[theme_id] = {
                    "id": theme_id,
                    "name": str(row.get("theme_name", "")).strip() or "Untitled theme",
                    "parentId": str(row.get("parent_theme_id", "")).strip() or None,
                    "x": number(row.get("theme_x")),
                    "y": number(row.get("theme_y")),
                    "width": number(row.get("theme_width")),
                    "height": number(row.get("theme_height")),
                }

        path_ids = {}
        codes = {}
        files = set()
        for index, row in enumerate(rows):
            code_label = str(row.get("code", "")).strip()
            if not code_label:
                continue
            code_id = str(row.get("code_id", "")).strip() or f"restored_code_{len(codes) + 1}"
            group_id = str(row.get("group_id", "")).strip() or None
            group_path = str(row.get("group_path", "")).strip()
            if not group_id and group_path:
                parent_id = None
                accumulated = []
                for name in [part.strip() for part in group_path.split(">") if part.strip()]:
                    accumulated.append(name)
                    path_key = " > ".join(accumulated)
                    if path_key not in path_ids:
                        generated_id = f"restored_theme_{len(path_ids) + 1}"
                        path_ids[path_key] = generated_id
                        themes[generated_id] = {"id": generated_id, "name": name, "parentId": parent_id, "x": None, "y": None}
                    parent_id = path_ids[path_key]
                group_id = parent_id
            item = codes.setdefault(code_id, {
                "id": code_id,
                "code": code_label,
                "count": 0,
                "participants": set(),
                "quotes": [],
                "groupId": group_id,
                "x": number(row.get("code_x"), 45 + (len(codes) % 7) * 250),
                "y": number(row.get("code_y"), 55 + (len(codes) // 7) * 86),
            })
            participant = str(row.get("participant_id", "")).strip()
            workbook = str(row.get("source_workbook", "")).strip()
            item["count"] += 1
            if participant:
                item["participants"].add(participant)
            if workbook:
                files.add(workbook)
            item["quotes"].append({
                "participantId": participant,
                "quote": str(row.get("quote", "")).strip(),
                "coderId": str(row.get("coder_id", "")).strip(),
                "description": "",
                "workbook": workbook,
            })
        output_codes = []
        for item in codes.values():
            item["participants"] = sorted(item["participants"])
            output_codes.append(item)
        self.send_json({"ok": True, "themes": list(themes.values()), "codes": output_codes, "files": sorted(files)})

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
                            "If this is a certificate error, set CA_BUNDLE_PATH in QualCodeDesk/.env "
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
