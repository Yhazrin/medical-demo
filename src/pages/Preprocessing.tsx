import { useState, useCallback, useRef } from 'react';
import {
  Play,
  Settings,
  FolderOpen,
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import GlassCard from '../components/GlassCard';
import WorkspaceLayout from '../components/WorkspaceLayout';
import UploadZone from '../components/UploadZone';
import ModelSelector from '../components/ModelSelector';
import ResultViewer from '../components/ResultViewer';
import StatusBadge from '../components/StatusBadge';
import { uploadAndPreprocess } from '../api/client';

type PageStatus = 'idle' | 'processing' | 'done' | 'error';

const presetOptions = [
  {
    value: 'default',
    labelKey: 'preprocessing.presetDefault',
    descriptionKey: 'preprocessing.presetDefaultDesc',
  },
  {
    value: 'resize',
    labelKey: 'preprocessing.presetResize',
    descriptionKey: 'preprocessing.presetResizeDesc',
  },
  {
    value: 'slice',
    labelKey: 'preprocessing.presetSlice',
    descriptionKey: 'preprocessing.presetSliceDesc',
  },
];

export default function Preprocessing() {
  const { t } = useTranslation();
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [selectedPreset, setSelectedPreset] = useState('default');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<string[]>([]);
  const [status, setStatus] = useState<PageStatus>('idle');

  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearProgressTimer = () => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
  };

  const handleFilesSelected = useCallback((files: FileList) => {
    setUploadedFiles(Array.from(files));
    setResults([]);
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
    if (uploadedFiles.length === 0) {
      alert(t('preprocessing.noFileAlert'));
      return;
    }

    setProcessing(true);
    setStatus('processing');
    setResults([]);
    setProgress(0);

    simulateProgress();

    try {
      const response = await uploadAndPreprocess(uploadedFiles[0]);
      clearProgressTimer();
      setProgress(100);
      setResults(response.slices);
      setStatus('done');
    } catch {
      clearProgressTimer();
      setStatus('error');
    } finally {
      setProcessing(false);
    }
  };

  const resultImages = results.map((src, i) => ({
    src: src.startsWith('data:') ? src : `data:image/png;base64,${src}`,
    label: `${t('common.slice')} ${i + 1}`,
  }));

  const sidebar = (
    <>
      <GlassCard title={t('preprocessing.uploadTitle')}>
        <UploadZone
          onFilesSelected={handleFilesSelected}
          accept=".nii,.gz,.nii.gz"
          multiple
          title={t('preprocessing.uploadHint')}
          subtitle={t('preprocessing.uploadSubtitle')}
        />
        {uploadedFiles.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-sm text-ui-secondary">
            <FolderOpen className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-strong)' }} />
            <span>
              {t('preprocessing.filesLoaded', { count: uploadedFiles.length })}
            </span>
          </div>
        )}
      </GlassCard>

      <GlassCard title={t('preprocessing.settingsTitle')}>
        <div className="flex items-center gap-2 mb-3">
          <Settings className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-strong)' }} />
          <span className="text-sm text-ui-secondary">{t('preprocessing.selectPreset')}</span>
        </div>
        <ModelSelector
          options={presetOptions}
          value={selectedPreset}
          onChange={setSelectedPreset}
        />
        <p className="mt-3 text-xs text-ui-muted flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {t('preprocessing.currentVersionTip')}
        </p>
      </GlassCard>

      <GlassCard>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleStart}
              disabled={processing || uploadedFiles.length === 0}
              className="btn-accent flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {processing ? t('preprocessing.processingBtn') : t('preprocessing.startBtn')}
            </button>
            <StatusBadge status={status} />
          </div>

          {(status === 'processing' || status === 'done') && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-ui-secondary">
                <span>{t('preprocessing.progress')}</span>
                <span className="tabular-nums">{Math.round(progress)}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>
      </GlassCard>
    </>
  );

  const main = (
    <GlassCard title={t('preprocessing.resultTitle')} fill>
      {status === 'idle' && results.length === 0 && (
        <ResultViewer
          images={[]}
          emptyText={t('preprocessing.emptyText')}
        />
      )}

      {status === 'processing' && (
        <div
          className="flex flex-col items-center justify-center gap-3 py-12 min-h-[12rem]"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Loader2
            className="w-10 h-10 animate-spin"
            style={{ color: 'var(--accent-strong)' }}
          />
          <p className="text-sm m-0">{t('preprocessing.processingText')}</p>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-ui-secondary min-h-[12rem]">
          <AlertCircle className="w-10 h-10 text-[var(--text-primary)]" />
          <p className="text-sm m-0 text-center">
            {t('preprocessing.errorText')}
          </p>
        </div>
      )}

      {status === 'done' && resultImages.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-ui-secondary flex-wrap">
            <CheckCircle className="w-4 h-4 shrink-0 text-[var(--text-primary)]" />
            <span>
              {t('preprocessing.doneText', { count: resultImages.length })}
            </span>
          </div>
          <ResultViewer images={resultImages} />
        </div>
      )}
    </GlassCard>
  );

  return (
    <WorkspaceLayout
      sidebar={sidebar}
      main={main}
      sidebarLabel={t('preprocessing.sidebarLabel')}
      mainLabel={t('preprocessing.mainLabel')}
    />
  );
}
