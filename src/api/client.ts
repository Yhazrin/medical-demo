import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000/api',
  timeout: 120_000,
});

/** 后端可能返回完整 data URL 或裸 base64 */
export function dataUriFromApiImage(value: string): string {
  if (!value) return '';
  const v = value.trim();
  if (v.startsWith('data:')) return v;
  return `data:image/png;base64,${v}`;
}

export interface PreprocessResult {
  slices: string[];
}

export interface ClassificationItem {
  filename: string;
  label: string;
  confidence: number;
  model: string;
  source: string;
  image: string;
}

export interface ClassificationResult {
  results: ClassificationItem[];
}

export interface SegmentationItem {
  filename: string;
  original: string;
  segmented: string;
  groundTruth?: string;
}

export interface SegmentationResult {
  results: SegmentationItem[];
}

export async function uploadAndPreprocess(file: File): Promise<PreprocessResult> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post<PreprocessResult>('/preprocess', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function classifySlices(formData: FormData): Promise<ClassificationResult> {
  const { data } = await api.post<ClassificationResult>('/classify', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function segmentSlices(formData: FormData): Promise<SegmentationResult> {
  const { data } = await api.post<SegmentationResult>('/segment', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
