import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload,
  Play,
  Trash2,
  CheckCircle,
  AlertCircle,
  Loader2,
  Image,
  FileJson,
  FileSpreadsheet,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import GlassCard from '../components/GlassCard';
import WorkspaceLayout from '../components/WorkspaceLayout';
import UploadZone from '../components/UploadZone';
import ModelSelector from '../components/ModelSelector';
import { classifySlices, dataUriFromApiImage } from '../api/client';

type PageStatus = 'idle' | 'processing' | 'done' | 'error';

interface ClassifyResult {
  filename: string;
  label: string;
  labelKey: string;
  confidence: number;
  model: string;
  source: string;
  image: string;
}

const modelOptions = [
  { value: 'resnet50_imagenet', labelKey: 'classification.modelResnet50', descriptionKey: 'classification.modelResnet50Desc' },
  { value: 'vgg16_imagenet', labelKey: 'classification.modelVgg16', descriptionKey: 'classification.modelVgg16Desc' },
  { value: 'alexnet_imagenet', labelKey: 'classification.modelAlexnet', descriptionKey: 'classification.modelAlexnetDesc' },
  { value: 'densenet121_imagenet', labelKey: 'classification.modelDensenet121', descriptionKey: 'classification.modelDensenet121Desc' },
];

const STORAGE_KEY = 'medical_demo_classification_results';
const MAX_STORAGE_ITEMS = 50;  // Limit to prevent localStorage quota exceeded

function loadFromStorage(): ClassifyResult[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveToStorage(results: ClassifyResult[]) {
  try {
    // Keep only the most recent items to avoid localStorage quota exceeded
    const limited = results.slice(-MAX_STORAGE_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(limited));
  } catch (e) {
    // If still fails (quota exceeded), clear and retry with fewer items
    if (e.name === 'QuotaExceededError') {
      localStorage.removeItem(STORAGE_KEY);
      const limited = results.slice(-10);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(limited));
    }
  }
}

function exportToJson(results: ClassifyResult[], filename: string = 'classification_results.json') {
  const data = results.map(r => ({
    filename: r.filename,
    label: r.label,
    confidence: r.confidence,
    model: r.model,
    source: r.source,
  }));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportToCsv(results: ClassifyResult[], filename: string = 'classification_results.csv') {
  const headers = ['filename', 'label', 'confidence', 'model', 'source'];
  const rows = results.map(r => [r.filename, r.label, r.confidence.toString(), r.model, r.source]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Classification() {
  const { t } = useTranslation();
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [selectedModel, setSelectedModel] = useState('unet3d_custom');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [history, setHistory] = useState<ClassifyResult[]>([]);
  const [status, setStatus] = useState<PageStatus>('idle');
  const [viewMode, setViewMode] = useState<'all' | 'hasLesion' | 'noLesion'>('all');

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
    if (uploadedFiles.length === 0 || !selectedModel) return;

    setProcessing(true);
    setStatus('processing');
    setProgress(0);

    simulateProgress();

    const formData = new FormData();
    uploadedFiles.forEach((file) => formData.append('files', file));
    formData.append('model', selectedModel);

    try {
      const response = await classifySlices(formData, i18n.language);
      clearProgressTimer();
      setProgress(100);

      const newResults = response.results.map((r) => ({
        filename: r.filename,
        label: r.label,
        labelKey: `common.${r.label_key === 'lesion' ? 'lesion' : 'noLesion'}`,
        confidence: r.confidence,
        model: r.model,
        source: r.source,
        image: r.image,
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

  const filteredResults = viewMode === 'all'
    ? history
    : viewMode === 'hasLesion'
      ? history.filter(r => r.label === '有病灶')
      : history.filter(r => r.label === '无病灶');

  const lesionCount = history.filter(r => r.label === '有病灶').length;
  const noLesionCount = history.filter(r => r.label === '无病灶').length;

  const getLabelDisplay = (result: ClassifyResult) => {
    return result.labelKey ? t(result.labelKey) : result.label;
  };

  const sidebar = (
    <>
      <GlassCard title={t('classification.uploadTitle')}>
        <UploadZone
          onFilesSelected={handleFilesSelected}
          accept="image/*"
          multiple
          title={t('classification.uploadHint')}
          subtitle={t('classification.uploadSubtitle')}
        />
        {uploadedFiles.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-sm text-ui-secondary">
            <Image className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-strong)' }} />
            <span>
              {t('classification.filesLoaded', { count: uploadedFiles.length })}
            </span>
          </div>
        )}
      </GlassCard>

      <GlassCard title={t('classification.modelTitle')}>
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
          {processing ? t('classification.processingBtn') : t('classification.startBtn')}
        </button>

        {(status === 'processing' || status === 'done') && (
          <div className="space-y-1.5 mt-3">
            <div className="flex justify-between text-xs text-ui-secondary">
              <span>{t('preprocessing.progress')}</span>
              <span className="tabular-nums">{Math.round(progress)}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {status === 'error' && (
          <p className="text-xs text-red-400 mt-3 text-center">{t('classification.failedText')}</p>
        )}
      </GlassCard>

      {history.length > 0 && (
        <GlassCard title={t('classification.exportTitle')}>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => exportToJson(history, `classification_${Date.now()}.json`)}
              className="btn-secondary flex items-center justify-center gap-2"
            >
              <FileJson className="w-4 h-4" />
              {t('common.exportJson')}
            </button>
            <button
              onClick={() => exportToCsv(history, `classification_${Date.now()}.csv`)}
              className="btn-secondary flex items-center justify-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {t('common.exportCsv')}
            </button>
            <button
              onClick={handleClearHistory}
              className="btn-danger flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              {t('classification.clearHistoryBtn')}
            </button>
          </div>
        </GlassCard>
      )}
    </>
  );

  const main = (
    <GlassCard title={t('classification.resultTitle')} fill>
      {history.length === 0 && (
        <div
          className="flex flex-col items-center justify-center gap-3 py-16 min-h-[12rem]"
          style={{ color: 'var(--text-muted)' }}
        >
          <Upload className="w-12 h-12 opacity-40" />
          <p className="text-sm m-0 text-ui-secondary">{t('classification.emptyTitle')}</p>
          <p className="text-xs text-ui-muted m-0">{t('classification.emptySubtitle')}</p>
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3 pb-3" style={{ borderBottom: '1px solid var(--stroke-2)' }}>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-400" />
                <span className="text-sm">
                  {t('classification.lesionCount')}: <span className="font-mono font-semibold text-red-400">{lesionCount}</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="text-sm">
                  {t('classification.noLesionCount')}: <span className="font-mono font-semibold text-green-400">{noLesionCount}</span>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value as typeof viewMode)}
                className="input-field text-sm py-1.5"
              >
                <option value="all">{t('classification.filterAll')} ({history.length})</option>
                <option value="hasLesion">{t('classification.filterHasLesion')} ({lesionCount})</option>
                <option value="noLesion">{t('classification.filterNoLesion')} ({noLesionCount})</option>
              </select>
            </div>
          </div>

          {filteredResults.length > 0 ? (
            <div className="result-grid">
              {filteredResults.map((r, i) => {
                const isLesion = r.label === '有病灶';
                return (
                  <div
                    key={`${r.filename}-${i}`}
                    className="result-card"
                  >
                    <div className="result-image-container">
                      <img
                        src={dataUriFromApiImage(r.image)}
                        alt={r.filename}
                        className="result-image"
                      />
                      <div className={`result-badge ${isLesion ? 'badge-lesion' : 'badge-no-lesion'}`}>
                        {getLabelDisplay(r)}
                      </div>
                    </div>
                    <div className="result-info">
                      <p className="result-filename" title={r.filename}>{r.filename}</p>
                      <p className="result-confidence">
                        {t('common.confidence')}: {(r.confidence * 100).toFixed(1)}%
                      </p>
                      <p className="result-model">{r.model}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-ui-muted">
              <p>{t('classification.noFilterResult')}</p>
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
      sidebarLabel={t('classification.sidebarLabel')}
      mainLabel={t('classification.mainLabel')}
    />
  );
}
