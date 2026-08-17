# Local Qualitative Coding Platform

A lightweight, local browser app for manually coding qualitative transcripts. It supports reusable codes, saved sessions, optional AI suggestions, optional audio transcription, and Excel exports.

This project is built on top of [QualCodeDesk](https://github.com/Dinithipurna/QualCodeDesk).

## Main changes in this version

- Added optional OpenAI-generated coding suggestions guided by research questions or hypotheses.\
**Note**: Use this feature with caution, as it might influence your coding behaviour  
- Added optional Deepgram transcription for audio placed in a configurable recordings folder, and automatic speech-to-text for interview recordings.
- Added synchronized transcript and recording navigation with in-browser audio playback.
- Added project names, coder IDs, reusable codes, excerpt descriptions, and an aggregated codebook export.
- Added reloadable session files and browser-local state so coding work can continue across sessions.


The app has no required third-party Python packages. Manual coding and exports stay on the computer running it. Optional AI suggestions send the active transcript to OpenAI, and optional transcription sends audio to Deepgram.

## Quick start

### 1. Get the code

```bash
git clone https://github.com/chitralekha18/qualitative-analysis.git
cd qualitative-analysis
```

Alternatively, download the repository as a ZIP and open a terminal in the extracted directory.

### 2. Check Python

Python 3.9 or newer is recommended:

```bash
python3 --version
```

### 3. Start the app

```bash
python3 app.py
```

Open <http://127.0.0.1:8000> in a modern browser. To use another port, pass it as an argument:

```bash
python3 app.py 8001
```

### 4. Try the sample project

Click **Load Sample** to explore the interface with artificial, publication-safe data. No API keys are needed.

## Use your own data

You can either:

- put `.txt` files in `transcripts/` and refresh the page, or
- load transcript files through the browser interface.

Then:

1. Enter a project name and coder ID.
2. Select text in a transcript.
3. Create or reuse a code and optionally add a description.
4. Click **Apply code**.
5. Use **Save Session File** for a reloadable session or **Export Excel** for analysis elsewhere.

The app automatically creates local recovery files in `data/` and `exports/`. Those directories are excluded from Git.

## Optional API setup

The core coding workflow works without API keys. Keys can be entered in **Settings**, provided as environment variables, or stored in a local `.env` file.

To create a local configuration file:

```bash
cp .env.example .env
```

Then edit `.env` as needed. It is ignored by Git.

### AI-generated code suggestions

Set `OPENAI_API_KEY` to enable **Generate codes**:

```text
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4.1-mini
```

Only use this feature when sending transcript text to OpenAI is permitted by your data-handling requirements.

### Audio transcription

Place supported audio files in `recordings/`, then set a Deepgram key:

```text
DEEPGRAM_API_KEY=your_deepgram_api_key
DEEPGRAM_MODEL=nova-3
```

Supported formats are `.m4a`, `.mp3`, `.wav`, `.aac`, `.ogg`, `.webm`, and `.mp4`. The app checks for missing transcripts at startup and when recordings are refreshed. You can set `RECORDINGS_FOLDER` or use **Settings** to keep audio outside the repository.

## Saving and exports

Browser state is supplemented by a local recovery session at `data/coding_session.json`. The latest recovery workbook is saved at `exports/coding_session_latest.xlsx`.

Downloaded session files contain transcript text, codes, descriptions, and coder identifiers. Treat them as research data. Excel exports contain:

- a `Codes` sheet with one row per coded excerpt; and
- a `Codebook` sheet with unique codes, descriptions, counts, and participant totals.

## Keeping private data out of Git

The included `.gitignore` excludes:

- `.env` files and common key files;
- everything placed in `recordings/`, `transcripts/`, and `data/`;
- generated files in `exports/`;
- saved `*.session.json` files and `.xlsx` workbooks; and
- common Python, editor, and operating-system artifacts.

Artificial examples in `examples/` remain tracked. Before publishing, verify the exact file list:

```bash
git status --short
git check-ignore -v recordings/* transcripts/* data/* exports/*
```

Never force-add ignored research data or credentials with `git add -f`.

## Project structure

```text
app.py          Local Python server and API integrations
index.html      Application interface
script.js       Coding workflow and browser state
style.css       Interface styles
examples/       Artificial sample transcript and session
recordings/     Local audio (ignored)
transcripts/    Local transcript data (ignored)
data/           Local recovery session (ignored)
exports/        Generated workbooks (ignored)
```

## Troubleshooting

- **Port already in use:** run `python3 app.py 8001` and open the matching URL.
- **No transcripts appear:** add `.txt` files to `transcripts/`, load files in the interface, or configure Deepgram for audio transcription.
- **Certificate verification fails:** set `CA_BUNDLE_PATH` in `.env` to the appropriate certificate bundle, commonly `/etc/ssl/cert.pem` on macOS.
- **Optional feature is unavailable:** open **Settings** and confirm the relevant API key is configured.

## License

Released under the MIT License. See [LICENSE](LICENSE).
