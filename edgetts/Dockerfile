# Edge-TTS microservice: Microsoft's neural voices over the network.
# No model weights, no torch — the whole image is ~150MB and idles at ~60MB RAM.
FROM python:3.12-slim

# ffmpeg is only used to trim the silence edge-tts pads every clip with
# (~250ms head / ~850ms tail), which otherwise reads as a long pause between
# sentences during playback.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
