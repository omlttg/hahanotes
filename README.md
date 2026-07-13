# 🎙️ HahaNotes

> **Banishing Developer Burnout with AI Banter Podcasts & Short Videos**
> 
> *Live Demo:* **[hahanotes.vercel.app](https://hahanotes.vercel.app/)**
> *Weekend Challenge:* Submitted for [Weekend Challenge: Passion Edition](https://dev.to/challenges/weekend-2026-07-09)

---

## 🌟 Introduction

**HahaNotes** is an interactive web application designed to help developers, office workers, and students vent their daily stress by transforming real-world struggles (e.g. legacy bugs at 3 AM, unpaid overtime, or exam anxiety) into hilarious, sarcastic AI-voiced banters, complete podcasts, and ready-to-share short videos.

The application features a dialogue between two contrasting AI hosts:
- **Rookie (The Naive Optimist):** A starry-eyed beginner who sees the world through rose-colored glasses, uses corporate buzzwords, and believes completely in hustle culture.
- **Cynic (The Sarcastic Senior):** A battle-hardened veteran who gently (or not so gently) pops Rookie's bubble with dry, witty tech sarcasm and relatable references.

---

## 🚀 Key Features

1. **AI Comedy Script Generation:** Powered by **Google Gemini**, creating hilarious 4-6 scene dialogs on-demand based on user category, topic, and stress input.
2. **Multi-Voice AI Podcast:** Stitches individual host voiceovers (**ElevenLabs** / **gTTS** fallback) with ambient lo-fi music and laugh tracks.
3. **Continuous Banter Chat:** Continue the conversation dynamically! Send messages to the hosts and they will reply in character, generating audio on the fly.
4. **Vertical 9:16 Canvas Short Video:** Renders animated host avatars, subtitles, and expressive memes. Download as a ready-to-share `.webm` short video.
5. **Precise Karaoke Subtitle Sync:** Fully synchronized word-by-word subtitle coloring matching the audio timeline.
6. **Robust Fallbacks & Quota Protection:** Server-side SQLite cache prevents duplicate LLM and TTS requests. An on-demand audio downloader fetches FFmpeg on Vercel dynamically.

---

## 🛠️ Tech Stack

### Frontend
- **Framework:** Next.js 16 (App Router), React 19, TypeScript
- **Styling:** TailwindCSS, Custom CSS for glassmorphism and animations
- **Media Engine:** HTML5 Canvas, Web Audio API, MediaRecorder API

### Backend
- **Framework:** FastAPI (Python 3.11)
- **AI Models & SDKs:** 
  - **Google GenAI SDK** (`gemini-3.5-flash` for structured scripts, `gemini-2.5-flash` for chats, Google Image API for custom memes)
  - **ElevenLabs API** (for premium natural text-to-speech)
  - **gTTS** (Google Text-to-Speech fallback)
- **Audio Processing:** `pydub` (for mixing BGM, SFX, and analyzing exact millisecond timestamps of voices)
- **Database:** SQLite (caching generated prompt scripts and MD5 audio mappings)

---

## 📊 System Architecture & Implementation Details

```mermaid
graph TD
    User([User input]) --> Frontend[Next.js Client]
    Frontend -->|POST /api/generate-script| Backend[FastAPI Server]
    Backend -->|Check Cache| DB[(SQLite Database)]
    DB -->|Miss| Gemini[Gemini 3.5 Flash]
    Gemini -->|JSON Script| Backend
    Backend -->|Register MD5 audio mapping| DB
    Backend -->|Return script + stream URLs| Frontend
    
    Frontend -->|GET /api/podcast/{id}.mp3| Backend
    Backend -->|Generate audio scenes| ElevenLabs[ElevenLabs TTS]
    ElevenLabs -->|Fail / Quota Limit| gTTS[gTTS Fallback]
    gTTS -->|Save cache| CacheFiles[MP3 Cache]
    Backend -->|Merge audio + BGM + SFX| MergedMP3[Merged Podcast]
    Backend -->|GET /metadata| TimingEngine[Timing Sync Engine]
    TimingEngine -->|Exact Timestamps JSON| Frontend
    Frontend -->|Render canvas & record| MediaRecorder[MediaRecorder]
```

### 1. Zero-Cost Client-Side Video Export
Instead of spending heavy cloud budget rendering video on the backend, HahaNotes renders the animation dynamically on a `canvas` and captures it in real-time alongside the combined audio stream using the browser's native **MediaRecorder API**.

### 2. Auto-Configuring Serverless FFmpeg on Vercel
Since Vercel serverless functions do not include the system-level `ffmpeg` binary needed by `pydub`, the backend features an **on-demand static downloader** (`ensure_ffmpeg()`). Upon startup, it detects the environment, downloads a static Linux x64 binary to `/tmp/bin`, and injects it into `PATH` on the fly.

---

## 💻 Local Development Setup

### Prerequisites
- Node.js 18+
- Python 3.11+
- FFmpeg installed locally (only required for local audio merging)

### 1. Clone the repository
```bash
git clone git@github.com:omlttg/hahanotes.git
cd hahanotes
```

### 2. Backend Setup (FastAPI)
Create a Python virtual environment and install dependencies:
```bash
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`
pip install -r requirements.txt
```

Create a `.env` file in the root directory:
```env
GEMINI_API_KEY=your_gemini_api_key
ELEVENLABS_API_KEY=your_elevenlabs_api_key
```

Run the backend server:
```bash
python api/index.py
# Server runs on http://localhost:8081
```

### 3. Frontend Setup (Next.js)
Install Node dependencies:
```bash
npm install
```

Run the frontend dev server:
```bash
npm run dev
# App runs on http://localhost:3000
```

---

## 💡 How to Use
1. Open the application.
2. Select a **Category** (De-stress, Fun Learning, Hot News) and a **Topic**.
3. Type in your daily struggle/stressful note (e.g. *"Calculus exam tomorrow and I only know how to write my name"* or *"Deploying to prod on Friday at 4:50 PM"*).
4. Customize host voices, enable/disable Background Music and Laughter SFX in the sidebar.
5. Click **Generate Show** to listen to the dialogue.
6. Switch to the **Short Video** tab, preview the animated card with karaoke subtitles, and click **Download Video** to export a viral video format!

---

## 👨‍💻 Author
- Developed by **omlttg**
- Project Repository: [github.com/omlttg/hahanotes](https://github.com/omlttg/hahanotes)
