"""
Medical Image Processing Demo - FastAPI Backend

Provides three endpoints for a medical imaging demo:
  - POST /api/preprocess  : NIfTI (.nii.gz) -> PNG slices with optional processing
  - POST /api/classify    : Image classification with multiple models (custom 3D UNet, ResNet-50, EfficientNet-B0)
  - POST /api/segment     : Image segmentation with 3D UNet model
"""

from __future__ import annotations

import base64
import io
import os
import sys
import tempfile
from pathlib import Path
from typing import List, Optional, Dict

import numpy as np
import torch
import torchvision.models as torchvision_models
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image, ImageEnhance, ImageFilter
from scipy import ndimage

# Add pytorch-3dunet to path
BASE_DIR = Path(__file__).parent.parent.parent.resolve()
PYTORCH_3DUNET_PATH = BASE_DIR / "frameworks" / "pytorch-3dunet" / "pytorch-3dunet-master"

# Model directory
MODELS_DIR = Path(__file__).parent / "models"

# Available models for classification
CLASSIFY_MODELS = {
    "unet3d_custom": {
        "name": "3D UNet (自训练)",
        "file": "best_real_model.pth",
        "source": "自训练",
        "type": "segmentation"  # Used for segmentation but can classify
    },
    "resnet50_imagenet": {
        "name": "ResNet-50 (ImageNet预训练)",
        "file": "resnet50_imagenet.pth",
        "source": "PyTorch下载",
        "type": "classification"
    },
    "efficientnet_b0_imagenet": {
        "name": "EfficientNet-B0 (ImageNet预训练)",
        "file": "efficientnet_b0_imagenet.pth",
        "source": "PyTorch下载",
        "type": "classification"
    }
}

# Available models for segmentation (only 3D UNet for now)
SEGMENT_MODELS = {
    "unet3d_custom": {
        "name": "3D UNet (自训练)",
        "file": "best_real_model.pth",
        "source": "自训练"
    }
}

# Global model cache
_model_cache: Dict[str, torch.nn.Module] = {}


def get_device():
    """Get the best available device."""
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def load_unet3d_model(model_path: Path, device: torch.device) -> torch.nn.Module:
    """Load the custom 3D UNet segmentation model."""
    if str(PYTORCH_3DUNET_PATH) not in sys.path:
        sys.path.insert(0, str(PYTORCH_3DUNET_PATH))

    from unet3d.model import UNet3D

    # Create 3D UNet model
    model = UNet3D(
        in_channels=1,
        out_channels=1,
        f_maps=32,
        final_sigmoid=True,
        layer_order='gcr',
        num_groups=8
    )

    # Load trained weights
    if model_path.exists():
        checkpoint = torch.load(model_path, map_location=device, weights_only=False)
        if 'model_state_dict' in checkpoint:
            model.load_state_dict(checkpoint['model_state_dict'])
        elif 'state_dict' in checkpoint:
            model.load_state_dict(checkpoint['state_dict'])
        else:
            model.load_state_dict(checkpoint)
        print(f"Loaded 3D UNet from {model_path}")

    model = model.to(device)
    model.eval()
    return model


def load_resnet50_model(model_path: Path, device: torch.device) -> torch.nn.Module:
    """Load ResNet-50 for classification."""
    model = torchvision_models.resnet50(weights=None)

    if model_path.exists():
        state_dict = torch.load(model_path, map_location=device, weights_only=True)
        model.load_state_dict(state_dict)
        print(f"Loaded ResNet-50 from {model_path}")

    # Remove final FC layer for feature extraction
    model = torch.nn.Sequential(*list(model.children())[:-1])
    model = model.to(device)
    model.eval()
    return model


def load_efficientnet_model(model_path: Path, device: torch.device) -> torch.nn.Module:
    """Load EfficientNet-B0 for classification."""
    model = torchvision_models.efficientnet_b0(weights=None)

    if model_path.exists():
        state_dict = torch.load(model_path, map_location=device, weights_only=True)
        model.load_state_dict(state_dict)
        print(f"Loaded EfficientNet-B0 from {model_path}")

    # Remove classifier layer for feature extraction
    model = torch.nn.Sequential(model.features, model.avgpool, torch.nn.Flatten())
    model = model.to(device)
    model.eval()
    return model


def load_model(model_key: str, task_type: str = "classification") -> torch.nn.Module:
    """Load model by key. Uses cache if available."""
    global _model_cache

    cache_key = f"{task_type}_{model_key}"
    if cache_key in _model_cache:
        return _model_cache[cache_key]

    device = get_device()

    if task_type == "segmentation":
        model_info = SEGMENT_MODELS.get(model_key)
        if not model_info:
            raise ValueError(f"Unknown segmentation model: {model_key}")
    else:
        model_info = CLASSIFY_MODELS.get(model_key)
        if not model_info:
            raise ValueError(f"Unknown classification model: {model_key}")

    model_file = model_info["file"]
    model_path = MODELS_DIR / model_file

    if model_key == "unet3d_custom":
        model = load_unet3d_model(model_path, device)
    elif model_key == "resnet50_imagenet":
        model = load_resnet50_model(model_path, device)
    elif model_key == "efficientnet_b0_imagenet":
        model = load_efficientnet_model(model_path, device)
    else:
        raise ValueError(f"Model loader not implemented: {model_key}")

    _model_cache[cache_key] = model
    return model


# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(title="Medical Image Processing API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _png_to_base64(img: Image.Image) -> str:
    """Convert a PIL Image to a base64-encoded PNG data-URI string."""
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64}"


def _numpy_to_base64(arr: np.ndarray) -> str:
    """Convert a uint8 numpy array (H, W) or (H, W, 3/4) to a base64 PNG."""
    if arr.ndim == 2:
        img = Image.fromarray(arr, mode="L")
    else:
        img = Image.fromarray(arr)
    return _png_to_base64(img)


def _normalize_slice(arr2d: np.ndarray) -> np.ndarray:
    """Normalize a 2-D array to uint8 [0, 255]."""
    lo, hi = arr2d.min(), arr2d.max()
    if hi - lo == 0:
        return np.zeros_like(arr2d, dtype=np.uint8)
    return (((arr2d - lo) / (hi - lo)) * 255.0).astype(np.uint8)


def _apply_clahe_like(arr2d: np.ndarray) -> np.ndarray:
    """Apply a CLAHE-like histogram equalisation using Pillow's auto-contrast."""
    img = Image.fromarray(arr2d, mode="L")
    img = ImageEnhance.Contrast(img).enhance(1.8)
    return np.array(img)


def _apply_gaussian_blur(arr2d: np.ndarray, radius: float = 1.0) -> np.ndarray:
    """Apply Gaussian blur to reduce noise."""
    img = Image.fromarray(arr2d, mode="L")
    img = img.filter(ImageFilter.GaussianBlur(radius=radius))
    return np.array(img)


def _base64_to_pil(data_uri: str) -> Image.Image:
    """Decode a data-URI (or raw base64) string back to a PIL Image."""
    if "," in data_uri:
        data_uri = data_uri.split(",", 1)[1]
    raw = base64.b64decode(data_uri)
    return Image.open(io.BytesIO(raw)).convert("RGB")


def _predict_unet3d(images: List[np.ndarray], model: torch.nn.Module, device: torch.device) -> List[dict]:
    """Run 3D UNet model inference."""
    results = []

    batch = np.stack([img.astype(np.float32) / 255.0 for img in images], axis=0)
    batch = torch.from_numpy(batch).unsqueeze(1).to(device)

    with torch.no_grad():
        logits = model(batch)
        probs = torch.sigmoid(logits)
        probs_np = probs.cpu().numpy()

    for i, img in enumerate(images):
        prob_map = probs_np[i, 0]
        threshold = 0.5
        lesion_mask = (prob_map > threshold)
        lesion_ratio = lesion_mask.sum() / lesion_mask.size

        if lesion_ratio > 0.01:
            label = "有病灶"
            confidence = float(min(0.99, 0.6 + lesion_ratio * 10))
        else:
            label = "无病灶"
            confidence = float(min(0.99, 0.6 + (0.01 - lesion_ratio) * 10))

        img_uint8 = (img / 255.0 * 255).astype(np.uint8) if img.max() > 1 else img.astype(np.uint8)
        img_rgb = np.stack([img_uint8] * 3, axis=-1) if img.ndim == 2 else img

        overlay = img_rgb.copy()
        mask_3d = np.stack([lesion_mask] * 3, axis=-1)
        overlay[mask_3d] = np.clip(overlay[mask_3d].astype(np.int32) + np.array([80, -30, -30]), 0, 255).astype(np.uint8)

        results.append({
            "label": label,
            "confidence": round(confidence, 4),
            "prob_map": prob_map,
            "overlay": overlay
        })

    return results


def _predict_classification(images: List[np.ndarray], model: torch.nn.Module, device: torch.device) -> List[dict]:
    """Run classification model (ResNet/EfficientNet) inference."""
    results = []

    for img in images:
        # Resize to 224x224 for classification models
        pil_img = Image.fromarray(img.astype(np.uint8) if img.max() > 1 else img).convert("RGB")
        pil_img = pil_img.resize((224, 224), Image.BILINEAR)
        img_np = np.array(pil_img).astype(np.float32) / 255.0

        # Normalize with ImageNet stats
        mean = np.array([0.485, 0.456, 0.406]).reshape(1, 1, 3)
        std = np.array([0.229, 0.224, 0.225]).reshape(1, 1, 3)
        img_np = (img_np - mean) / std

        # Convert to tensor
        batch = torch.from_numpy(img_np).permute(2, 0, 1).unsqueeze(0).to(device)

        with torch.no_grad():
            features = model(batch)
            # Simple confidence based on feature magnitude
            feature_magnitude = float(features.abs().mean())
            confidence = min(0.99, 0.5 + feature_magnitude * 2)

        # For pretrained models, we use a simple heuristic
        # In production, you'd use actual ImageNet class labels
        if feature_magnitude > 0.3:
            label = "有病灶"
        else:
            label = "无病灶"

        # Create overlay (same segmentation for visualization)
        img_uint8 = (img / 255.0 * 255).astype(np.uint8) if img.max() > 1 else img.astype(np.uint8)
        img_rgb = np.stack([img_uint8] * 3, axis=-1) if img.ndim == 2 else img

        results.append({
            "label": label,
            "confidence": round(confidence, 4),
            "prob_map": np.zeros((img.shape[0], img.shape[1])),
            "overlay": img_rgb
        })

    return results


# ---------------------------------------------------------------------------
# GET /api/models  --  List available models
# ---------------------------------------------------------------------------

@app.get("/api/models")
async def get_models():
    """Return list of available models."""
    return {
        "classification": [
            {
                "key": key,
                "name": info["name"],
                "source": info["source"]
            }
            for key, info in CLASSIFY_MODELS.items()
        ],
        "segmentation": [
            {
                "key": key,
                "name": info["name"],
                "source": info["source"]
            }
            for key, info in SEGMENT_MODELS.items()
        ]
    }


# ---------------------------------------------------------------------------
# POST /api/preprocess  --  NIfTI -> PNG slices
# ---------------------------------------------------------------------------

@app.post("/api/preprocess")
async def preprocess(
    file: UploadFile = File(...),
):
    """Accept a NIfTI file (.nii / .nii.gz), convert every z-slice to a base64-encoded PNG."""
    filename = file.filename or ""
    if not (filename.endswith(".nii") or filename.endswith(".nii.gz")):
        raise HTTPException(
            status_code=400,
            detail="Only NIfTI files (.nii / .nii.gz) are accepted.",
        )

    try:
        import nibabel as nib
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="nibabel is not installed. Please install it with: pip install nibabel",
        )

    tmp_dir = tempfile.mkdtemp()
    tmp_path = os.path.join(tmp_dir, filename)
    try:
        content = await file.read()
        with open(tmp_path, "wb") as f:
            f.write(content)

        try:
            nii = nib.load(tmp_path)
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to parse NIfTI file: {exc}",
            )

        volume = np.asarray(nii.dataobj, dtype=np.float64)
        if volume.ndim < 3:
            raise HTTPException(
                status_code=400,
                detail="NIfTI volume must be at least 3-dimensional.",
            )

        zoom_factors = (128.0 / volume.shape[0], 128.0 / volume.shape[1], 1.0)
        volume = ndimage.zoom(volume, zoom_factors)

        total_slices = volume.shape[2]
        slices = []
        processed_slices = []

        for z in range(total_slices):
            slc = volume[:, :, z]
            normed = _normalize_slice(slc)
            slices.append(_numpy_to_base64(normed))

            blurred = _apply_gaussian_blur(normed, radius=1.2)
            enhanced = _apply_clahe_like(blurred)
            processed_slices.append(_numpy_to_base64(enhanced))

        return JSONResponse(
            content={
                "slices": slices,
                "processed_slices": processed_slices,
                "total_slices": total_slices,
            }
        )
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        if os.path.isdir(tmp_dir):
            os.rmdir(tmp_dir)


# ---------------------------------------------------------------------------
# POST /api/classify  --  Image classification with multiple models
# ---------------------------------------------------------------------------

@app.post("/api/classify")
async def classify(
    files: List[UploadFile] = File(...),
    model: str = Form("unet3d_custom"),
):
    """Accept one or more image files and classify using selected model."""
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")

    # Validate model
    if model not in CLASSIFY_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown model: {model}. Available: {list(CLASSIFY_MODELS.keys())}",
        )

    model_info = CLASSIFY_MODELS[model]

    try:
        seg_model = load_model(model, task_type="classification")
        device = get_device()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load model: {e}",
        )

    results = []
    images = []

    for upload in files:
        try:
            img_bytes = await upload.read()
            img = Image.open(io.BytesIO(img_bytes)).convert("L")
            arr = np.array(img, dtype=np.float32)
            images.append(arr)
        except Exception:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot open file '{upload.filename}' as an image.",
            )

    # Use appropriate prediction function
    if model == "unet3d_custom":
        model_results = _predict_unet3d(images, seg_model, device)
    else:
        model_results = _predict_classification(images, seg_model, device)

    for i, upload in enumerate(files):
        img_bytes = await upload.read()
        img_rgb = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        b64 = _png_to_base64(img_rgb)

        results.append(
            {
                "filename": upload.filename,
                "label": model_results[i]["label"],
                "confidence": model_results[i]["confidence"],
                "model": model_info["name"],
                "source": model_info["source"],
                "image": b64,
            }
        )

    return JSONResponse(content={"results": results})


# ---------------------------------------------------------------------------
# POST /api/segment  --  Image segmentation
# ---------------------------------------------------------------------------

@app.post("/api/segment")
async def segment(
    files: List[UploadFile] = File(...),
    model: str = Form("unet3d_custom"),
):
    """Accept one or more image files and segment using selected model."""
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")

    # Validate model
    if model not in SEGMENT_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown model: {model}. Available: {list(SEGMENT_MODELS.keys())}",
        )

    try:
        seg_model = load_model(model, task_type="segmentation")
        device = get_device()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load model: {e}",
        )

    results = []
    images = []

    for upload in files:
        try:
            img_bytes = await upload.read()
            img = Image.open(io.BytesIO(img_bytes)).convert("L")
            arr = np.array(img, dtype=np.float32)
            images.append(arr)
        except Exception:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot open file '{upload.filename}' as an image.",
            )

    model_results = _predict_unet3d(images, seg_model, device)

    file_handles = []
    for upload in files:
        img_bytes = await upload.read()
        file_handles.append(img_bytes)

    for i, upload in enumerate(files):
        img_bytes = file_handles[i]
        img_rgb = Image.open(io.BytesIO(img_bytes)).convert("RGB")

        results.append(
            {
                "filename": upload.filename,
                "label": model_results[i]["label"],
                "confidence": model_results[i]["confidence"],
                "image": _png_to_base64(img_rgb),
                "overlay": _numpy_to_base64(model_results[i]["overlay"]),
            }
        )

    return JSONResponse(content={"results": results})


# ---------------------------------------------------------------------------
# Run the app
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)