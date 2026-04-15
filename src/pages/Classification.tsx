import { useState, useRef, useCallback } from 'react';
import {
  Upload,
  Play,
  FolderOpen,
  CheckCircle,
  AlertCircle,
  Loader2,
  Tag,
  Image,
} from 'lucide-react';
import GlassCard from '../components/GlassCard';
import WorkspaceLayout from '../components/WorkspaceLayout';
import UploadZone from '../components/UploadZone';
import ModelSelector from '../components/ModelSelector';
import ResultViewer from '../components/ResultViewer';
import StatusBadge from '../components/StatusBadge';
import { classifySlices, dataUriFromApiImage } from '../api/client';

type PageStatus = 'idle' | 'processing' | 'done' | 'error';

interface ClassifyResult {
  filename: string;
  label: string;
  confidence: number;
  image: string;
}

const modelOptions = [
  { value: 'vgg', label: 'VGG-16', description: '经典深度卷积网络，适合图像分类任务' },
  { value: 'resnet', label: 'ResNet-50', description: '残差网络，深层特征提取能力强' },
  { value: 'efficientnet', label: 'EfficientNet-B0', description: '高效轻量网络，平衡精度与效率' },
];

export default function Classification() {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [selectedModel, setSelectedModel] = useState('vgg');
  const [savePath, setSavePath] = useState('./output/classification_results/');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ClassifyResult[]>([]);
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
    if (uploadedFiles.length === 0 || !selectedModel) return;

    setProcessing(true);
    setStatus('processing');
    setResults([]);
    setProgress(0);

    simulateProgress();

    const formData = new FormData();
    uploadedFiles.forEach((file) => formData.append('files', file));
    formData.append('model', selectedModel);
    formData.append('savePath', savePath);

    try {
      const response = await classifySlices(formData);
      clearProgressTimer();
      setProgress(100);
      setResults(response.results);
      setStatus('done');
    } catch {
      clearProgressTimer();
      setStatus('error');
    } finally {
      setProcessing(false);
    }
  };

  const lesionResults = results.filter((r) => r.label === '有病灶');
  const noLesionResults = results.filter((r) => r.label === '无病灶');

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
            <Image className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-strong)' }} />
            <span>
              已加载 <span className="text-emphasis">{uploadedFiles.length}</span> 张切片图像
            </span>
          </div>
        )}
      </GlassCard>

      <GlassCard title="分类模型选择">
        <ModelSelector
          options={modelOptions}
          value={selectedModel}
          onChange={setSelectedModel}
        />
      </GlassCard>

      <GlassCard title="结果保存设置">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-strong)' }} />
            <label className="text-sm text-ui-secondary">保存路径</label>
          </div>
          <input
            type="text"
            value={savePath}
            onChange={(e) => setSavePath(e.target.value)}
            className="input-field"
            placeholder="./output/classification_results/"
          />
          <p className="text-xs text-ui-muted flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 shrink-0" />
            系统将自动创建「有病灶」和「无病灶」两个子目录
          </p>
        </div>
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
              {processing ? '分类中...' : '开始分类'}
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
    <GlassCard title="分类结果" fill>
      {status === 'idle' && results.length === 0 && (
        <div
          className="flex flex-col items-center justify-center gap-3 py-12 min-h-[12rem]"
          style={{ color: 'var(--text-muted)' }}
        >
          <Upload className="w-10 h-10 opacity-40" />
          <p className="text-sm m-0 text-ui-secondary">上传切片图像并开始分类以查看结果</p>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-ui-secondary min-h-[12rem]">
          <AlertCircle className="w-10 h-10 text-[var(--text-primary)]" />
          <p className="text-sm m-0">分类过程中发生错误，请重试</p>
        </div>
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
          <p className="text-sm m-0">正在分析切片图像...</p>
        </div>
      )}

      {status === 'done' && results.length > 0 && (
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <AlertCircle className="w-4 h-4 shrink-0 text-[var(--text-primary)]" />
              <h3 className="text-sm font-semibold m-0 text-[var(--text-primary)]">有病灶</h3>
              <span
                className="text-xs px-2 py-0.5 font-mono font-medium uppercase tracking-wider"
                style={{
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--chip-outline)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                {lesionResults.length} 张
              </span>
            </div>
            {lesionResults.length > 0 ? (
              <div className="result-grid">
                <ResultViewer
                  images={lesionResults.map((r) => ({
                    src: dataUriFromApiImage(r.image),
                    label: `${r.filename} (${(r.confidence * 100).toFixed(1)}%)`,
                  }))}
                />
              </div>
            ) : (
              <p className="text-xs text-ui-muted pl-6 m-0">未检测到病灶</p>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <CheckCircle className="w-4 h-4 shrink-0 text-[var(--text-secondary)]" />
              <h3 className="text-sm font-semibold m-0 text-[var(--text-primary)]">无病灶</h3>
              <span
                className="text-xs px-2 py-0.5 font-mono font-medium uppercase tracking-wider"
                style={{
                  background: 'var(--bg-inset)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--stroke-1)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                {noLesionResults.length} 张
              </span>
            </div>
            {noLesionResults.length > 0 ? (
              <div className="result-grid">
                <ResultViewer
                  images={noLesionResults.map((r) => ({
                    src: dataUriFromApiImage(r.image),
                    label: `${r.filename} (${(r.confidence * 100).toFixed(1)}%)`,
                  }))}
                />
              </div>
            ) : (
              <p className="text-xs text-ui-muted pl-6 m-0">所有切片均检测到病灶</p>
            )}
          </div>

          <div
            className="flex items-start gap-2 text-sm text-ui-secondary pt-4"
            style={{ borderTop: '1px solid var(--stroke-2)' }}
          >
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-[var(--text-primary)]" />
            <span>
              分类完成，共{' '}
              <span className="font-mono text-[var(--text-primary)] font-semibold">{results.length}</span>{' '}
              张切片，其中{' '}
              <span className="font-mono text-[var(--text-primary)] font-semibold">
                {lesionResults.length}
              </span>{' '}
              张有病灶，
              <span className="font-mono text-[var(--text-primary)] font-semibold">
                {noLesionResults.length}
              </span>{' '}
              张无病灶
            </span>
          </div>
        </div>
      )}
    </GlassCard>
  );

  return (
    <WorkspaceLayout
      sidebar={sidebar}
      main={main}
      sidebarLabel="数据与模型"
      mainLabel="分类输出"
    />
  );
}
