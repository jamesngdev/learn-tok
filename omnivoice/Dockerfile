# OmniVoice TTS microservice (CPU). Heavy image: PyTorch + diffusion model.
FROM python:3.12-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# CPU-only PyTorch first (the CUDA wheels are huge and useless here).
RUN pip install --no-cache-dir torch==2.8.0 torchaudio==2.8.0 \
  --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

ENV HF_HOME=/data/hf-cache
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
