/** 顶部导航中央胶囊内随路由切换的说明文案 */

export interface WorkflowRouteContext {
  kicker: string;
  title: string;
  description: string;
}

const DEFAULT: WorkflowRouteContext = {
  kicker: '工作流',
  title: '医学影像',
  description: '在左侧完成参数与运行，右侧查看输出结果。',
};

export const WORKFLOW_ROUTE_CONTEXT: Record<string, WorkflowRouteContext> = {
  '/': {
    kicker: '工作流 · 预处理',
    title: 'MRI 预处理',
    description:
      '上传 MRI 扫描文件，配置预处理参数并生成标准化切片。左侧完成参数与运行，右侧查看切片预览。',
  },
  '/classify': {
    kicker: '工作流 · 分类',
    title: '切片分类',
    description:
      '上传医学切片图像，使用深度学习模型进行病灶分类。左侧配置模型与路径，右侧按类别浏览缩略图与置信度。',
  },
  '/segment': {
    kicker: '工作流 · 分割',
    title: '病灶分割',
    description:
      '上传切片并选择模型后由后端 /api/segment 生成分割图与掩膜；右侧三列对比展示。底部表格为示例指标。',
  },
};

export function getWorkflowRouteContext(pathname: string): WorkflowRouteContext {
  return WORKFLOW_ROUTE_CONTEXT[pathname] ?? DEFAULT;
}
