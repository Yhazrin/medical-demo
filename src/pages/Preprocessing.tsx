import { useState, useCallback, useRef } from 'react';
import {
  Play,
  Settings,
  FolderOpen,
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
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
    label: '标准重采样 (1.0, 1.0, 1.0)',
    description: '将体素间距统一重采样至 1mm³',
  },
  {
    value: 'resize',
    label: '尺寸裁剪 (256×256×256)',
    description: '将体积裁剪至统一尺寸便于模型输入',
  },
  {
    value: 'slice',
    label: '切片转换 (128×128)',
    description: '沿轴向切片并缩放至 128×128 像素',
  },
];

export default function Preprocessing() {
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
      alert('请先上传 MRI 数据文件');
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
    label: `切片 ${i + 1}`,
  }));

  const sidebar = (
    <>
      <GlassCard title="MRI 数据上传">
        <UploadZone
          onFilesSelected={handleFilesSelected}
          accept=".nii,.gz,.nii.gz"
          multiple
          title="上传 MRI 扫描文件"
          subtitle="支持 .nii / .nii.gz 格式，可同时上传多个文件"
        />
        {uploadedFiles.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-sm text-ui-secondary">
            <FolderOpen className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-strong)' }} />
            <span>
              已加载 <span className="text-emphasis">{uploadedFiles.length}</span> 个文件
            </span>
          </div>
        )}
      </GlassCard>

      <GlassCard title="预处理设置">
        <div className="flex items-center gap-2 mb-3">
          <Settings className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-strong)' }} />
          <span className="text-sm text-ui-secondary">选择预处理预设方案</span>
        </div>
        <ModelSelector
          options={presetOptions}
          value={selectedPreset}
          onChange={setSelectedPreset}
        />
        <p className="mt-3 text-xs text-ui-muted flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          当前版本使用默认预处理参数
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
              {processing ? '预处理中...' : '开始预处理'}
            </button>
            <StatusBadge status={status} />
          </div>

          {(status === 'processing' || status === 'done') && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-ui-secondary">
                <span>处理进度</span>
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
    <GlassCard title="预处理结果" fill>
      {status === 'idle' && results.length === 0 && (
        <ResultViewer
          images={[]}
          emptyText="上传 MRI 数据并开始预处理以查看结果"
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
          <p className="text-sm m-0">正在预处理 MRI 数据，请稍候...</p>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-ui-secondary min-h-[12rem]">
          <AlertCircle className="w-10 h-10 text-[var(--text-primary)]" />
          <p className="text-sm m-0 text-center">
            预处理过程中发生错误，请检查文件格式后重试
          </p>
        </div>
      )}

      {status === 'done' && resultImages.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-ui-secondary flex-wrap">
            <CheckCircle className="w-4 h-4 shrink-0 text-[var(--text-primary)]" />
            <span>
              预处理完成，共生成{' '}
              <span className="text-emphasis">{resultImages.length}</span> 个切片
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
      sidebarLabel="参数与运行"
      mainLabel="切片预览"
    />
  );
}
