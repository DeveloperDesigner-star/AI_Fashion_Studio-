# CatVTON GPU worker — NOT built or run in the lightweight API container.
# Requires an NVIDIA GPU with >= 8 GB VRAM (1024×768, bf16) and the NVIDIA
# Container Toolkit on the host.
# `devel` is required because Detectron2/DensePose compile CUDA C++ extensions.
FROM nvidia/cuda:12.1.1-cudnn8-devel-ubuntu22.04

ARG CATVTON_REF=edited
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/models/huggingface \
    CATVTON_REPO=/opt/CatVTON \
    CATVTON_VERSION=mix \
    CATVTON_PRECISION=bf16 \
    FORCE_CUDA=1 \
    TORCH_CUDA_ARCH_LIST="8.0;8.6;8.9;9.0"

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 python3-pip python3-dev git curl libgl1 libglib2.0-0 \
        build-essential cmake ninja-build \
    && rm -rf /var/lib/apt/lists/*

# CatVTON's upstream code and checkpoints are CC BY-NC-SA 4.0. This image is
# intended for non-commercial use with attribution.
RUN git clone --depth 1 --branch "${CATVTON_REF}" https://github.com/Zheng-Chong/CatVTON.git /opt/CatVTON

WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN python3 -m pip install --no-cache-dir --upgrade pip \
    && python3 -m pip install --no-cache-dir torch==2.4.0 torchvision==0.19.0 \
        --index-url https://download.pytorch.org/whl/cu121 \
    && python3 -m pip install --no-cache-dir -r /app/requirements.txt

# Automatic masking (AutoMasker) imports Detectron2 and DensePose. They are not
# in CatVTON's requirements.txt but are required by its Gradio app (see
# https://github.com/Zheng-Chong/CatVTON/blob/main/INSTALL.md). Build them after
# torch so the C++ extensions link against the CUDA build above.
RUN git clone --depth 1 https://github.com/facebookresearch/detectron2.git /opt/detectron2 \
    && python3 -m pip install --no-cache-dir -e /opt/detectron2 \
    && python3 -m pip install --no-cache-dir \
        "git+https://github.com/facebookresearch/detectron2@main#subdirectory=projects/DensePose"

COPY app.py /app/app.py
RUN mkdir -p /models && useradd --create-home --uid 10001 worker && chown -R worker:worker /models /app
USER worker

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=600s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8080/health || exit 1

CMD ["python3", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
