import { useState, useCallback, useRef, type CSSProperties } from 'react';
import { Play, Image, Layers, BarChart3, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import GlassCard from '../components/GlassCard';
import WorkspaceLayout from '../components/WorkspaceLayout';
import UploadZone from '../components/UploadZone';
import ModelSelector from '../components/ModelSelector';
import StatusBadge from '../components/StatusBadge';
import { segmentSlices, dataUriFromApiImage, type SegmentationItem } from '../api/client';

type PageStatus = 'idle' | 'processing' | 'done' | 'error';

const modelOptions = [
  { value: 'unet3d_custom', label: '3D UNet (自训练)', description: '自己训练的3D UNet分割模型，47MB' },
];

const performanceData = [
  { model: '3D UNet (自训练)', dice: '-', iou: '-', precision: '-', recall: '-' },
];

const panelFrame: CSSProperties = {
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--stroke-1)',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  height: 200,
  background: 'var(--bg-inset)',
};

export default function Segmentation() {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [selectedModel, setSelectedModel] = useState('unet3d_custom');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<SegmentationItem[]>([]);
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
    if (uploadedFiles.length === 0 || processing) return;

    setProcessing(true);
    setStatus('processing');
    setResults([]);
    setProgress(0);
    simulateProgress();

    const formData = new FormData();
    uploadedFiles.forEach((file) => formData.append('files', file));
    formData.append('model', selectedModel);

    try {
      const response = await segmentSlices(formData);
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
              {processing ? '分割中...' : '开始分割'}
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

          <p className="text-xs text-ui-muted flex items-center gap-1.5 m-0">
            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
            分割由后端 `/api/segment` 实时计算（阈值 + 形态学演示管线）
          </p>
        </div>
      </GlassCard>
    </>
  );

  const main = (
    <GlassCard title="分割结果展示" fill>
      {status === 'idle' && results.length === 0 && (
        <div
          className="flex flex-col items-center justify-center gap-3 py-12 min-h-[12rem]"
          style={{ color: 'var(--text-muted)' }}
        >
          <Layers className="w-10 h-10 opacity-40" />
          <p className="text-sm m-0 text-ui-secondary">
            上传切片图像后点击「开始分割」，将调用后端生成原图、分割叠加与参考掩膜
          </p>
        </div>
      )}

      {status === 'processing' && (
        <div
          className="flex flex-col items-center justify-center gap-3 py-12 min-h-[12rem]"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Loader2 className="w-10 h-10 animate-spin text-[var(--text-primary)]" />
          <p className="text-sm m-0">正在请求后端分割，请稍候...</p>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-ui-secondary min-h-[12rem]">
          <AlertCircle className="w-10 h-10 text-[var(--text-primary)]" />
          <p className="text-sm m-0 text-center">
            分割请求失败，请确认后端已启动（localhost:8000）且图片格式有效
          </p>
        </div>
      )}

      {status === 'done' && results.length > 0 && (
        <div className="space-y-6">
          {results.map((row) => (
            <div key={row.filename} className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div style={panelFrame}>
                  <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                    <img
                      src={dataUriFromApiImage(row.original)}
                      alt={`${row.filename} 原始`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono uppercase tracking-wider text-ui-secondary text-center py-1.5 border-t border-[var(--stroke-2)]">
                    原始图像
                  </span>
                </div>

                <div style={{ ...panelFrame, borderColor: 'var(--result-mid-border)' }}>
                  <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                    <img
                      src={dataUriFromApiImage(row.segmented)}
                      alt={`${row.filename} 分割`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono uppercase tracking-wider text-[var(--text-primary)] text-center py-1.5 border-t border-[var(--stroke-2)] bg-[var(--result-mid-bg)]">
                    分割结果
                  </span>
                </div>

                <div style={panelFrame}>
                  <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                    {row.groundTruth ? (
                      <img
                        src={dataUriFromApiImage(row.groundTruth)}
                        alt={`${row.filename} 真值`}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-ui-muted">
                        <CheckCircle className="w-8 h-8 mb-2 opacity-50" />
                        <span className="text-xs">无真值</span>
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-mono uppercase tracking-wider text-ui-secondary text-center py-1.5 border-t border-[var(--stroke-2)]">
                    掩膜参考
                  </span>
                </div>
              </div>

              <p className="text-xs text-ui-muted text-center m-0 font-mono">{row.filename}</p>
            </div>
          ))}

          <div
            className="flex items-center gap-2 text-sm text-ui-secondary pt-4"
            style={{ borderTop: '1px solid var(--stroke-2)' }}
          >
            <CheckCircle className="w-4 h-4 shrink-0 text-[var(--text-primary)]" />
            <span>
              分割完成，共 <span className="text-emphasis font-mono">{results.length}</span> 张
            </span>
          </div>
        </div>
      )}
    </GlassCard>
  );

  const footer = (
    <GlassCard title="分割性能指标（示例数据）">
      <p className="text-xs text-ui-muted m-0 mb-3">
        下列数值为演示用静态指标，非当前请求实时计算结果。
      </p>
      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--stroke-2)]">
        <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--stroke-2)', background: 'var(--bg-inset)' }}>
              <th className="text-left py-3 px-4 font-semibold text-ui-secondary font-mono text-xs uppercase tracking-wider">
                模型
              </th>
              <th className="text-center py-3 px-4 font-semibold text-ui-secondary font-mono text-xs uppercase tracking-wider">
                Dice系数
              </th>
              <th className="text-center py-3 px-4 font-semibold text-ui-secondary font-mono text-xs uppercase tracking-wider">
                IoU
              </th>
              <th className="text-center py-3 px-4 font-semibold text-ui-secondary font-mono text-xs uppercase tracking-wider">
                精确率
              </th>
              <th className="text-center py-3 px-4 font-semibold text-ui-secondary font-mono text-xs uppercase tracking-wider">
                召回率
              </th>
            </tr>
          </thead>
          <tbody>
            {performanceData.map((row, idx) => (
              <tr
                key={row.model}
                style={{
                  borderBottom: '1px solid var(--stroke-2)',
                  background: idx % 2 === 0 ? 'var(--table-zebra)' : 'transparent',
                }}
              >
                <td
                  className="py-3 px-4 font-medium flex items-center gap-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <BarChart3 className="w-4 h-4 shrink-0 text-[var(--text-muted)]" />
                  {row.model}
                </td>
                <td className="py-3 px-4 text-center font-mono tabular-nums text-[var(--text-primary)]">
                  {row.dice}
                </td>
                <td className="py-3 px-4 text-center font-mono tabular-nums text-[var(--text-primary)]">
                  {row.iou}
                </td>
                <td className="py-3 px-4 text-center font-mono tabular-nums text-[var(--text-primary)]">
                  {row.precision}
                </td>
                <td className="py-3 px-4 text-center font-mono tabular-nums text-[var(--text-primary)]">
                  {row.recall}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );

  return (
    <WorkspaceLayout
      sidebar={sidebar}
      main={main}
      sidebarLabel="数据与运行"
      mainLabel="分割对比"
      footer={footer}
    />
  );
}
