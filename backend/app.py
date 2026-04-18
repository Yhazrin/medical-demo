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
    "resnet50_imagenet": {
        "name_zh": "ResNet-50",
        "name_en": "ResNet-50",
        "file": "resnet50_imagenet.pth",
        "source_zh": "ImageNet预训练",
        "source_en": "ImageNet",
        "type": "classification"
    },
    "vgg16_imagenet": {
        "name_zh": "VGG-16",
        "name_en": "VGG-16",
        "file": "vgg16_imagenet.pth",
        "source_zh": "ImageNet预训练",
        "source_en": "ImageNet",
        "type": "classification"
    },
    "alexnet_imagenet": {
        "name_zh": "AlexNet",
        "name_en": "AlexNet",
        "file": "alexnet_imagenet.pth",
        "source_zh": "ImageNet预训练",
        "source_en": "ImageNet",
        "type": "classification"
    },
    "densenet121_imagenet": {
        "name_zh": "DenseNet-121",
        "name_en": "DenseNet-121",
        "file": "densenet121_imagenet.pth",
        "source_zh": "ImageNet预训练",
        "source_en": "ImageNet",
        "type": "classification"
    }
}

# Available models for segmentation
SEGMENT_MODELS = {
    "unet3d_custom": {
        "name_zh": "U-Net (3D 自训练)",
        "name_en": "U-Net (3D Custom)",
        "file": "best_real_model.pth",
        "source_zh": "自训练",
        "source_en": "Custom"
    },
    "unetplusplus_custom": {
        "name_zh": "U-Net++",
        "name_en": "U-Net++",
        "file": "",
        "source_zh": "待训练",
        "source_en": "To be trained"
    },
    "deeplabv3_custom": {
        "name_zh": "DeepLabV3",
        "name_en": "DeepLabV3",
        "file": "",
        "source_zh": "待训练",
        "source_en": "To be trained"
    },
    "transunet_custom": {
        "name_zh": "TransUNet",
        "name_en": "TransUNet",
        "file": "",
        "source_zh": "待训练",
        "source_en": "To be trained"
    }
}

# Label translations
LABEL_TRANSLATIONS = {
    "zh": {"lesion": "有病灶", "no_lesion": "无病灶"},
    "en": {"lesion": "Lesion", "no_lesion": "No Lesion"},
}

def get_label(lang: str, label_key: str) -> str:
    """Get translated label for the given language."""
    return LABEL_TRANSLATIONS.get(lang, LABEL_TRANSLATIONS["zh"]).get(label_key, label_key)

def get_model_name(model_info: dict, lang: str) -> str:
    """Get translated model name."""
    key = f"name_{lang}"
    return model_info.get(key, model_info.get("name_zh", ""))

def get_model_source(model_info: dict, lang: str) -> str:
    """Get translated model source."""
    key = f"source_{lang}"
    return model_info.get(key, model_info.get("source_zh", ""))

# Global model cache
_model_cache: Dict[str, torch.nn.Module] = {}


def get_device():
    """Get the best available device."""
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def load_unet3d_model(model_path: Path, device: torch.device) -> torch.nn.Module:
    """Load the custom 3D UNet segmentation model."""
    if str(PYTORCH_3DUNET_PATH) not in sys.path:
        sys.path.insert(0, str(PYTORCH_3DUNET_PATH))

    from pytorch3dunet.unet3d.model import UNet3D

    # Create 3D UNet model
    model = UNet3D(
        in_channels=1,
        out_channels=1,
        f_maps=32,
        final_sigmoid=True,
        layer_order='gcr',
        num_groups=1,
        conv_upscale=2
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

    # Replace final FC layer for 2-class classification
    model.fc = torch.nn.Linear(model.fc.in_features, 2)
    model = model.to(device)
    model.eval()
    return model


def load_vgg16_model(model_path: Path, device: torch.device) -> torch.nn.Module:
    """Load VGG-16 for classification."""
    model = torchvision_models.vgg16(weights=None)

    if model_path.exists():
        state_dict = torch.load(model_path, map_location=device, weights_only=True)
        model.load_state_dict(state_dict)
        print(f"Loaded VGG-16 from {model_path}")

    # Replace final FC layer for 2-class classification
    model.classifier[6] = torch.nn.Linear(4096, 2)
    model = model.to(device)
    model.eval()
    return model


def load_alexnet_model(model_path: Path, device: torch.device) -> torch.nn.Module:
    """Load AlexNet for classification."""
    model = torchvision_models.alexnet(weights=None)

    if model_path.exists():
        state_dict = torch.load(model_path, map_location=device, weights_only=True)
        model.load_state_dict(state_dict)
        print(f"Loaded AlexNet from {model_path}")

    # Replace final FC layer for 2-class classification
    model.classifier[6] = torch.nn.Linear(4096, 2)
    model = model.to(device)
    model.eval()
    return model


def load_densenet121_model(model_path: Path, device: torch.device) -> torch.nn.Module:
    """Load DenseNet-121 for classification."""
    model = torchvision_models.densenet121(weights=None)

    if model_path.exists():
        state_dict = torch.load(model_path, map_location=device, weights_only=True)
        model.load_state_dict(state_dict)
        print(f"Loaded DenseNet-121 from {model_path}")

    # Replace classifier for 2-class classification
    model.classifier = torch.nn.Linear(model.classifier.in_features, 2)
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

    # Replace classifier layer for 2-class classification
    model.classifier = torch.nn.Linear(model.classifier.in_features, 2)
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
    if not model_file:
        raise ValueError(f"Model file not specified for {model_key}")
    model_path = MODELS_DIR / model_file

    if model_key == "unet3d_custom":
        model = load_unet3d_model(model_path, device)
    elif model_key == "resnet50_imagenet":
        model = load_resnet50_model(model_path, device)
    elif model_key == "vgg16_imagenet":
        model = load_vgg16_model(model_path, device)
    elif model_key == "alexnet_imagenet":
        model = load_alexnet_model(model_path, device)
    elif model_key == "densenet121_imagenet":
        model = load_densenet121_model(model_path, device)
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

    # Stack images and add depth dimension for 3D UNet: (N, 1, D, H, W)
    # D=32 to allow multiple pooling levels in depth dimension
    batch = np.stack([img.astype(np.float32) / 255.0 for img in images], axis=0)
    batch = np.expand_dims(batch, axis=1)   # (N, 1, H, W)
    batch = np.expand_dims(batch, axis=2)   # (N, 1, 1, H, W)
    batch = np.repeat(batch, 32, axis=2)    # (N, 1, 32, H, W) - depth=32
    batch = torch.from_numpy(batch).to(device)  # (N, 1, 32, H, W)

    with torch.no_grad():
        logits = model(batch)
        probs = torch.sigmoid(logits)
        probs_np = probs.cpu().numpy()

    for i, img in enumerate(images):
        # probs_np shape: (N, 1, 1, H, W) -> squeeze to (H, W)
        prob_map = probs_np[i, 0, 0]
        threshold = 0.5
        lesion_mask = (prob_map > threshold)
        lesion_ratio = lesion_mask.sum() / lesion_mask.size

        if lesion_ratio > 0.01:
            label_key = "lesion"
            confidence = float(min(0.99, 0.6 + lesion_ratio * 10))
        else:
            label_key = "no_lesion"
            confidence = float(min(0.99, 0.6 + (0.01 - lesion_ratio) * 10))

        img_uint8 = (img / 255.0 * 255).astype(np.uint8) if img.max() > 1 else img.astype(np.uint8)
        img_rgb = np.stack([img_uint8] * 3, axis=-1) if img.ndim == 2 else img

        overlay = img_rgb.copy()
        overlay[lesion_mask] = np.clip(overlay[lesion_mask].astype(np.int32) + np.array([80, -30, -30]), 0, 255).astype(np.uint8)

        results.append({
            "label_key": label_key,
            "confidence": round(confidence, 4),
            "prob_map": prob_map,
            "overlay": overlay
        })

    return results


def _predict_2d_classifier(images: List[np.ndarray], model: torch.nn.Module, device: torch.device) -> List[dict]:
    """Run 2D classification model inference (VGG/AlexNet/DenseNet/ResNet)."""
    results = []

    for img in images:
        # Convert to RGB and resize to 224x224
        img_uint8 = (img / 255.0 * 255).astype(np.uint8) if img.max() > 1 else img.astype(np.uint8)
        img_rgb = np.stack([img_uint8] * 3, axis=-1) if img.ndim == 2 else img_uint8

        pil_img = Image.fromarray(img_rgb)
        pil_img = pil_img.resize((224, 224), Image.BILINEAR)
        img_np = np.array(pil_img).astype(np.float32) / 255.0

        # Normalize with ImageNet stats
        mean = np.array([0.485, 0.456, 0.406]).reshape(1, 1, 3)
        std = np.array([0.229, 0.224, 0.225]).reshape(1, 1, 3)
        img_np = (img_np - mean) / std

        # Convert to tensor
        batch = torch.from_numpy(img_np).permute(2, 0, 1).unsqueeze(0).to(device)

        with torch.no_grad():
            logits = model(batch)
            probs = torch.softmax(logits, dim=1)
            conf, pred = probs.max(1)

            label_key = "lesion" if pred.item() == 1 else "no_lesion"
            confidence = conf.item()

        results.append({
            "label_key": label_key,
            "confidence": round(confidence, 4),
            "prob_map": np.zeros((img.shape[0], img.shape[1])),
            "overlay": img_rgb
        })

    return results


def _predict_classification(images: List[np.ndarray], model: torch.nn.Module, device: torch.device) -> List[dict]:
    """Run classification model inference - uses 2D classifier."""
    return _predict_2d_classifier(images, model, device)


# ---------------------------------------------------------------------------
# GET /api/models  --  List available models
# ---------------------------------------------------------------------------

@app.get("/api/models")
async def get_models(lang: str = "zh"):
    """Return list of available models."""
    return {
        "classification": [
            {
                "key": key,
                "name": get_model_name(info, lang),
                "source": get_model_source(info, lang)
            }
            for key, info in CLASSIFY_MODELS.items()
        ],
        "segmentation": [
            {
                "key": key,
                "name": get_model_name(info, lang),
                "source": get_model_source(info, lang)
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
    lang: str = Form("zh"),
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
                "label": get_label(lang, model_results[i]["label_key"]),
                "label_key": model_results[i]["label_key"],
                "confidence": model_results[i]["confidence"],
                "model": get_model_name(model_info, lang),
                "source": get_model_source(model_info, lang),
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
    lang: str = Form("zh"),
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

    model_info = SEGMENT_MODELS[model]

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
    file_bytes = []  # Store original bytes for overlay generation

    for upload in files:
        try:
            img_bytes = await upload.read()
            file_bytes.append(img_bytes)
            img = Image.open(io.BytesIO(img_bytes)).convert("L")
            arr = np.array(img, dtype=np.float32)
            images.append(arr)
        except Exception:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot open file '{upload.filename}' as an image.",
            )

    model_results = _predict_unet3d(images, seg_model, device)

    for i, upload in enumerate(files):
        img_bytes = file_bytes[i]
        img_rgb = Image.open(io.BytesIO(img_bytes)).convert("RGB")

        results.append(
            {
                "filename": upload.filename,
                "label": get_label(lang, model_results[i]["label_key"]),
                "label_key": model_results[i]["label_key"],
                "confidence": model_results[i]["confidence"],
                "model": get_model_name(model_info, lang),
                "source": get_model_source(model_info, lang),
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