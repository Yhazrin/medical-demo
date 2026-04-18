/** 顶部导航中央胶囊内随路由切换的说明文案 */

import { useTranslation } from 'react-i18next';

export interface WorkflowRouteContext {
  kicker: string;
  title: string;
  description: string;
}

const WORKFLOW_ROUTE_KEYS = {
  '/': {
    kickerKey: 'workflow.preprocessing.kicker',
    titleKey: 'workflow.preprocessing.title',
    descriptionKey: 'workflow.preprocessing.description',
  },
  '/classify': {
    kickerKey: 'workflow.classification.kicker',
    titleKey: 'workflow.classification.title',
    descriptionKey: 'workflow.classification.description',
  },
  '/segment': {
    kickerKey: 'workflow.segmentation.kicker',
    titleKey: 'workflow.segmentation.title',
    descriptionKey: 'workflow.segmentation.description',
  },
};

const DEFAULT_KEYS = {
  kickerKey: 'workflow.kicker',
  titleKey: 'nav.systemTitle',
  descriptionKey: 'workflow.preprocessing.description',
};

export function useWorkflowRouteContext(pathname: string): WorkflowRouteContext {
  const { t } = useTranslation();
  const keys = WORKFLOW_ROUTE_KEYS[pathname as keyof typeof WORKFLOW_ROUTE_KEYS] ?? DEFAULT_KEYS;

  return {
    kicker: t(keys.kickerKey),
    title: t(keys.titleKey),
    description: t(keys.descriptionKey),
  };
}
