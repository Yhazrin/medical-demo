import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Play,
  Image,
  Layers,
  Loader2,
  FileJson,
  FileSpreadsheet,
  Trash2,
  Eye,
} from 'lucide-react';
import GlassCard from '../components/GlassCard';
import WorkspaceLayout from '../components/WorkspaceLayout';
import UploadZone from '../components/UploadZone';
import ModelSelector from '../components/ModelSelector';
import { segmentSlices, dataUriFromApiImage } from '../api/client';

type PageStatus = 'idle' | 'processing' | 'done' | 'error';

interface SegmentationResult {
  filename: string;
  label: string;
  confidence: number;
  original: string;
  overlay: string;
}

const modelOptions = [
  { value: 'unet3d_custom', label: '3D UNet (自训练)', description: '自己训练的3D UNet分割模型，47MB' }
];

const STORAGE_KEY = 'medical_demo_segmentation_results';

function loadFromStorage(): SegmentationResult[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveToStorage(results: SegmentationResult[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(results));
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
  }
}

function exportToJson(results: SegmentationResult[], filename: string = 'segmentation_results.json') {
  const data = results.map(r => ({
    filename: r.filename,
    label: r.label,
    confidence: r.confidence,
  }));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportToCsv(results: SegmentationResult[], filename: string = 'segmentation_results.csv') {
  const headers = ['filename', 'label', 'confidence'];
  const rows = results.map(r => [r.filename, r.label, r.confidence.toString()]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Segmentation() {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [selectedModel, setSelectedModel] = useState('unet3d_custom');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [history, setHistory] = useState<SegmentationResult[]>([]);
  const [status, setStatus] = useState<PageStatus>('idle');
  const [viewMode, setViewMode] = useState<'all' | 'grid'>('all');

  // Load from localStorage on mount
  useEffect(() => {
    const stored = loadFromStorage();
    if (stored.length > 0) {
      setHistory(stored);
    }
  }, []);

  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearProgressTimer = () => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
  };

  const handleFilesSelected = useCallback((files: FileList) => {
    setUploadedFiles(Array.from(files));
    setStatus('idle');
    setProgress(0);
  }, []);

  const simulateProgress = useCallback(() => {
    let current = 0;
    progressTimer.current = setInterval(() => {
      current += Math.random() * 8 + 2;
      if (current >= 90) {
        current = 90;
        clearProgressTimer();
      }
      setProgress(Math.min(current, 90));
    }, 300);
  }, []);

  const handleStart = async () => {
    if (uploadedFiles.length === 0 || processing) return;

    setProcessing(true);
    setStatus('processing');
    setProgress(0);
    simulateProgress();

    const formData = new FormData();
    uploadedFiles.forEach((file) => formData.append('files', file));
    formData.append('model', selectedModel);

    try {
      const response = await segmentSlices(formData);
      clearProgressTimer();
      setProgress(100);

      const newResults = response.results.map((r: any) => ({
        filename: r.filename,
        label: r.label,
        confidence: r.confidence,
        original: r.image,
        overlay: r.overlay,
      }));

      const allResults = [...history, ...newResults];
      setHistory(allResults);
      saveToStorage(allResults);

      setStatus('done');
    } catch {
      clearProgressTimer();
      setStatus('error');
    } finally {
      setProcessing(false);
    }
  };

  const handleClearHistory = () => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const sidebar = (
    <>
      <GlassCard title="加载切片">
        <UploadZone
          onFilesSelected={handleFilesSelected}
          accept="image/*"
          multiple
          title="拖拽切片图像到此处"
          subtitle="支持 PNG、JPEG、TIFF 等常见医学图像格式"
        />
        {uploadedFiles.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-sm text-ui-secondary">
            <Image className="w-4 h-4 shrink-0 text-[var(--text-primary)]" />
            <span>
              已加载 <span className="text-emphasis">{uploadedFiles.length}</span> 张切片图像
            </span>
          </div>
        )}
      </GlassCard>

      <GlassCard title="分割模型选择">
        <ModelSelector
          options={modelOptions}
          value={selectedModel}
          onChange={setSelectedModel}
        />
      </GlassCard>

      <GlassCard>
        <button
          onClick={handleStart}
          disabled={processing || uploadedFiles.length === 0}
          className="btn-accent w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {processing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {processing ? '分割中...' : '开始分割'}
        </button>

        {(status === 'processing' || status === 'done') && (
          <div className="space-y-1.5 mt-3">
            <div className="flex justify-between text-xs text-ui-secondary">
              <span>处理进度</span>
              <span className="tabular-nums">{Math.round(progress)}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {status === 'error' && (
          <p className="text-xs text-red-400 mt-3 text-center">分割失败，请重试</p>
        )}
      </GlassCard>

      {history.length > 0 && (
        <GlassCard title="结果导出">
          <div className="flex flex-col gap-2">
            <button
              onClick={() => exportToJson(history, `segmentation_${Date.now()}.json`)}
              className="btn-secondary flex items-center justify-center gap-2"
            >
              <FileJson className="w-4 h-4" />
              导出 JSON
            </button>
            <button
              onClick={() => exportToCsv(history, `segmentation_${Date.now()}.csv`)}
              className="btn-secondary flex items-center justify-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4" />
              导出 CSV
            </button>
            <button
              onClick={handleClearHistory}
              className="btn-danger flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              清空历史
            </button>
          </div>
        </GlassCard>
      )}
    </>
  );

  const main = (
    <GlassCard title="分割结果" fill>
      {history.length === 0 && (
        <div
          className="flex flex-col items-center justify-center gap-3 py-16 min-h-[12rem]"
          style={{ color: 'var(--text-muted)' }}
        >
          <Layers className="w-12 h-12 opacity-40" />
          <p className="text-sm m-0 text-ui-secondary">上传切片图像并开始分割</p>
          <p className="text-xs text-ui-muted m-0">结果将自动保存到本地存储，换页不丢失</p>
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex items-center justify-between flex-wrap gap-3 pb-3" style={{ borderBottom: '1px solid var(--stroke-2)' }}>
            <div className="flex items-center gap-4">
              <span className="text-sm">
                共 <span className="font-mono font-semibold">{history.length}</span> 张
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode(viewMode === 'all' ? 'grid' : 'all')}
                className="btn-secondary flex items-center gap-2 text-sm py-1.5"
              >
                <Eye className="w-4 h-4" />
                {viewMode === 'all' ? '网格视图' : '列表视图'}
              </button>
            </div>
          </div>

          {/* Grid View */}
          {viewMode === 'grid' ? (
            <div className="result-grid">
              {history.map((r, i) => (
                <div
                  key={`${r.filename}-${i}`}
                  className="result-card"
                >
                  <div className="result-image-container">
                    <img
                      src={dataUriFromApiImage(r.overlay)}
                      alt={r.filename}
                      className="result-image"
                    />
                    <div className="result-badge badge-lesion">
                      {r.label}
                    </div>
                  </div>
                  <div className="result-info">
                    <p className="result-filename" title={r.filename}>{r.filename}</p>
                    <p className="result-confidence">
                      置信度: {(r.confidence * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* List View */
            <div className="space-y-4">
              {history.map((r, i) => (
                <div key={`${r.filename}-${i}`} className="segment-result-item">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="segment-thumb">
                      <img
                        src={dataUriFromApiImage(r.original)}
                        alt={`${r.filename} 原始`}
                        className="segment-img"
                      />
                      <span className="segment-label">原始</span>
                    </div>
                    <div className="segment-thumb segment-thumb-overlay">
                      <img
                        src={dataUriFromApiImage(r.overlay)}
                        alt={`${r.filename} 分割`}
                        className="segment-img"
                      />
                      <span className="segment-label">分割</span>
                    </div>
                    <div className="segment-info">
                      <p className="text-sm font-medium m-0 truncate">{r.filename}</p>
                      <p className="text-xs text-ui-secondary m-0">
                        标签: <span className={r.label === '有病灶' ? 'text-red-400' : 'text-green-400'}>{r.label}</span>
                      </p>
                      <p className="text-xs text-ui-muted m-0">
                        置信度: {(r.confidence * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </GlassCard>
  );

  return (
    <WorkspaceLayout
      sidebar={sidebar}
      main={main}
      sidebarLabel="数据与模型"
      mainLabel="分割输出"
    />
  );
}