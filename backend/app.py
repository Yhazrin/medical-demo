"""
Medical Image Processing Demo - FastAPI Backend

Provides three endpoints for a medical imaging demo:
  - POST /api/preprocess  : NIfTI (.nii.gz) -> PNG slices with optional processing
  - POST /api/classify    : Heuristic lesion classification on uploaded images
  - POST /api/segment     : Simulated tumour segmentation with overlay masks
"""

from __future__ import annotations

import base64
import io
import os
import tempfile
from typing import List

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image, ImageEnhance, ImageFilter
from scipy import ndimage

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
# POST /api/classify  --  Heuristic lesion classifier
# ---------------------------------------------------------------------------

@app.post("/api/classify")
async def classify(
    files: List[UploadFile] = File(...),
    model: str = Form("default"),
):
    """
    Accept one or more image files and a model name (ignored -- this is a
    heuristic demo).  For each image, compute the pixel standard deviation;
    if it exceeds a threshold the image is labelled "has lesion".
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")

    results = []
    for upload in files:
        try:
            img_bytes = await upload.read()
            img = Image.open(io.BytesIO(img_bytes)).convert("L")  # grayscale
        except Exception:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot open file '{upload.filename}' as an image.",
            )

        arr = np.array(img, dtype=np.float64)
        std_val = float(np.std(arr))
        mean_val = float(np.mean(arr))

        # Heuristic: high variance -> likely has a lesion
        threshold = 30.0
        if std_val > threshold:
            label = "有病灶"
            # Confidence scales with how far above threshold
            confidence = min(0.99, 0.70 + (std_val - threshold) / 200.0)
        else:
            label = "无病灶"
            confidence = min(0.99, 0.70 + (threshold - std_val) / 200.0)

        confidence = round(max(0.60, confidence), 4)

        # Return the image as base64 for the frontend
        img_rgb = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        b64 = _png_to_base64(img_rgb)

        results.append(
            {
                "filename": upload.filename,
                "label": label,
                "confidence": confidence,
                "image": b64,
            }
        )

    return JSONResponse(content={"results": results})


# ---------------------------------------------------------------------------
# POST /api/segment  --  Simulated segmentation overlay
# ---------------------------------------------------------------------------

@app.post("/api/segment")
async def segment(
    files: List[UploadFile] = File(...),
    model: str = Form("default"),
):
    """
    Accept one or more image files and produce a simulated segmentation
    overlay.  A simple intensity threshold is applied, the binary mask is
    slightly dilated, and the mask region is tinted red.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")

    results = []
    for upload in files:
        try:
            img_bytes = await upload.read()
            img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        except Exception:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot open file '{upload.filename}' as an image.",
            )

        arr = np.array(img)
        gray = np.array(img.convert("L"), dtype=np.float64)

        # -- Threshold to create a binary mask (pick bright / high-variance
        #    regions -- a rough proxy for tumour tissue) --------------------
        threshold_val = max(100.0, float(np.mean(gray)) + 0.5 * float(np.std(gray)))
        mask = (gray > threshold_val).astype(np.uint8)

        # -- Slightly dilate the mask ---------------------------------------
        struct = ndimage.generate_binary_structure(2, 2)  # 3x3 cross
        mask = ndimage.binary_dilation(mask, structure=struct, iterations=2).astype(np.uint8)

        # -- Build "ground truth" as a filled green-tinted mask ------------
        gt = arr.copy()
        gt[mask == 1] = [0, 200, 0]

        # -- Build segmented overlay: red tint where mask == 1 -------------
        seg = arr.copy()
        seg[mask == 1, 0] = np.clip(seg[mask == 1, 0].astype(np.int32) + 150, 0, 255).astype(np.uint8)  # boost red
        seg[mask == 1, 1] = (seg[mask == 1, 1] * 0.5).astype(np.uint8)  # reduce green
        seg[mask == 1, 2] = (seg[mask == 1, 2] * 0.5).astype(np.uint8)  # reduce blue

        results.append(
            {
                "filename": upload.filename,
                "original": _numpy_to_base64(arr),
                "segmented": _numpy_to_base64(seg),
                "groundTruth": _numpy_to_base64(gt),
            }
        )

    return JSONResponse(content={"results": results})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
