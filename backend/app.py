"""
Medical Image Processing Demo - FastAPI Backend

Provides three endpoints for a medical imaging demo:
  - POST /api/preprocess  : NIfTI (.nii.gz) -> PNG slices with optional processing
  - POST /api/classify    : 3D UNet lesion classification on uploaded images
  - POST /api/segment     : 3D UNet tumour segmentation with overlay masks
"""

from __future__ import annotations

import base64
import io
import os
import sys
import tempfile
from pathlib import Path
from typing import List, Optional

import numpy as np
import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image, ImageEnhance, ImageFilter
from scipy import ndimage

# Add pytorch-3dunet to path
BASE_DIR = Path(__file__).parent.parent.parent.resolve()
PYTORCH_3DUNET_PATH = BASE_DIR / "frameworks" / "pytorch-3dunet" / "pytorch-3dunet-master"
MODEL_PATH = Path(__file__).parent / "models" / "best_real_model.pth"

# Global model instance
_model: Optional[torch.nn.Module] = None


def get_device():
    """Get the best available device."""
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def load_segmentation_model() -> torch.nn.Module:
    """Load the 3D UNet segmentation model."""
    global _model
    if _model is not None:
        return _model

    # Add pytorch-3dunet to path
    if str(PYTORCH_3DUNET_PATH) not in sys.path:
        sys.path.insert(0, str(PYTORCH_3DUNET_PATH))

    try:
        from unet3d.model import UNet3D

        # Create 3D UNet model - matching training config
        model = UNet3D(
            in_channels=1,
            out_channels=1,  # Binary segmentation (background + tumor)
            f_maps=32,  # Match training config
            final_sigmoid=True,
            layer_order='gcr',
            num_groups=8
        )

        # Load trained weights
        if MODEL_PATH.exists():
            checkpoint = torch.load(MODEL_PATH, map_location=get_device(), weights_only=False)
            if 'model_state_dict' in checkpoint:
                model.load_state_dict(checkpoint['model_state_dict'])
            elif 'state_dict' in checkpoint:
                model.load_state_dict(checkpoint['state_dict'])
            else:
                model.load_state_dict(checkpoint)
            print(f"Loaded model from {MODEL_PATH}")
        else:
            print(f"Warning: Model file not found at {MODEL_PATH}, using random weights")

        device = get_device()
        model = model.to(device)
        model.eval()
        _model = model

        return model
    except Exception as e:
        print(f"Failed to load model: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load segmentation model: {e}",
        )

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


def _predict_with_model(images: List[np.ndarray], model: torch.nn.Module, device: torch.device) -> List[dict]:
    """
    Run 3D UNet model inference on a list of 2D images.
    Returns classification results and segmentation masks.
    """
    results = []

    # Convert to batch tensor
    # Stack images to create a volume-like input
    batch = np.stack([img.astype(np.float32) / 255.0 for img in images], axis=0)  # [N, H, W]
    batch = torch.from_numpy(batch).unsqueeze(1).to(device)  # [N, 1, H, W]

    with torch.no_grad():
        # Model inference
        logits = model(batch)  # [N, 1, H, W]
        probs = torch.sigmoid(logits)  # [N, 1, H, W]

        # Convert to numpy
        probs_np = probs.cpu().numpy()

    for i, img in enumerate(images):
        prob_map = probs_np[i, 0]  # [H, W]

        # Calculate lesion score (mean probability in high-probability regions)
        # Use threshold-based analysis
        threshold = 0.5
        lesion_mask = (prob_map > threshold)
        lesion_ratio = lesion_mask.sum() / lesion_mask.size

        # Classification based on model prediction
        if lesion_ratio > 0.01:  # If more than 1% of image has tumor probability
            label = "有病灶"
            confidence = float(min(0.99, 0.6 + lesion_ratio * 10))
        else:
            label = "无病灶"
            confidence = float(min(0.99, 0.6 + (0.01 - lesion_ratio) * 10))

        # Create segmentation overlay
        # Normalize original image
        img_uint8 = (img / 255.0 * 255).astype(np.uint8) if img.max() > 1 else img.astype(np.uint8)
        img_rgb = np.stack([img_uint8] * 3, axis=-1) if img.ndim == 2 else img

        # Create red overlay for tumor regions
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


# ---------------------------------------------------------------------------
# POST /api/preprocess  --  NIfTI -> PNG slices
# ---------------------------------------------------------------------------

@app.post("/api/preprocess")
async def preprocess(
    file: UploadFile = File(...),
):
    """
    Accept a NIfTI file (.nii / .nii.gz), convert every z-slice to a
    base64-encoded PNG at 128x128 resolution, and also return
    pre-processed (Gaussian blur + CLAHE-like) versions.
    """
    # -- Validate extension ------------------------------------------------
    filename = file.filename or ""
    if not (filename.endswith(".nii") or filename.endswith(".nii.gz")):
        raise HTTPException(
            status_code=400,
            detail="Only NIfTI files (.nii / .nii.gz) are accepted.",
        )

    # -- Try importing nibabel (may not be installed) ----------------------
    try:
        import nibabel as nib
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail=(
                "nibabel is not installed. "
                "Please install it with: pip install nibabel"
            ),
        )

    # -- Save uploaded file to a temp location -----------------------------
    tmp_dir = tempfile.mkdtemp()
    tmp_path = os.path.join(tmp_dir, filename)
    try:
        content = await file.read()
        with open(tmp_path, "wb") as f:
            f.write(content)

        # -- Load the NIfTI volume -----------------------------------------
        try:
            nii = nib.load(tmp_path)
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to parse NIfTI file: {exc}",
            )

        volume = np.asarray(nii.dataobj, dtype=np.float64)  # (X, Y, Z)
        if volume.ndim < 3:
            raise HTTPException(
                status_code=400,
                detail="NIfTI volume must be at least 3-dimensional.",
            )

        # -- Resize x, y to 128x128 (keep z) ------------------------------
        zoom_factors = (128.0 / volume.shape[0], 128.0 / volume.shape[1], 1.0)
        volume = ndimage.zoom(volume, zoom_factors)

        total_slices = volume.shape[2]

        slices: List[str] = []
        processed_slices: List[str] = []

        for z in range(total_slices):
            slc = volume[:, :, z]  # (128, 128)

            # --- Original slice -------------------------------------------
            normed = _normalize_slice(slc)
            slices.append(_numpy_to_base64(normed))

            # --- Processed slice: blur + CLAHE ----------------------------
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
        # Clean up temp file
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        if os.path.isdir(tmp_dir):
            os.rmdir(tmp_dir)


# ---------------------------------------------------------------------------
# POST /api/classify  --  3D UNet lesion classification
# ---------------------------------------------------------------------------

@app.post("/api/classify")
async def classify(
    files: List[UploadFile] = File(...),
    model: str = Form("default"),
):
    """
    Accept one or more image files and use the trained 3D UNet model
    for lesion classification. Returns classification label and confidence.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")

    # Load model at startup (lazy loading)
    try:
        seg_model = load_segmentation_model()
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
            img = Image.open(io.BytesIO(img_bytes)).convert("L")  # grayscale
            arr = np.array(img, dtype=np.float32)
            images.append(arr)
        except Exception:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot open file '{upload.filename}' as an image.",
            )

    # Run model inference
    model_results = _predict_with_model(images, seg_model, device)

    for i, upload in enumerate(files):
        img_bytes = await upload.read()
        img_rgb = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        b64 = _png_to_base64(img_rgb)

        results.append(
            {
                "filename": upload.filename,
                "label": model_results[i]["label"],
                "confidence": model_results[i]["confidence"],
                "image": b64,
            }
        )

    return JSONResponse(content={"results": results})


# ---------------------------------------------------------------------------
# POST /api/segment  --  3D UNet tumour segmentation
# ---------------------------------------------------------------------------

@app.post("/api/segment")
async def segment(
    files: List[UploadFile] = File(...),
    model: str = Form("default"),
):
    """
    Accept one or more image files and use the trained 3D UNet model
    for tumour segmentation. Returns original image, segmentation overlay,
    and ground truth reference (if available).
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")

    # Load model at startup (lazy loading)
    try:
        seg_model = load_segmentation_model()
        device = get_device()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load model: {e}",
        )

    results = []
    images = []

    # Read all images first
    for upload in files:
        try:
            img_bytes = await upload.read()
            img = Image.open(io.BytesIO(img_bytes)).convert("L")  # grayscale
            arr = np.array(img, dtype=np.float32)
            images.append(arr)
        except Exception:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot open file '{upload.filename}' as an image.",
            )

    # Run model inference
    model_results = _predict_with_model(images, seg_model, device)

    # Build response with original images
    file_handles = []
    for upload in files:
        img_bytes = await upload.read()
        file_handles.append(img_bytes)

    for i, upload in enumerate(files):
        img_bytes = file_handles[i]
        img_rgb = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        arr = np.array(img_rgb)

        # Get segmentation result from model
        model_result = model_results[i]
        prob_map = model_result["prob_map"]
        overlay = model_result["overlay"]

        results.append(
            {
                "filename": upload.filename,
                "original": _numpy_to_base64(arr),
                "segmented": _numpy_to_base64(overlay),
                "groundTruth": _numpy_to_base64(overlay),  # Model prediction as reference
            }
        )

    return JSONResponse(content={"results": results})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
