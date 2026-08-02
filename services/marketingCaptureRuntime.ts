import { resolveMarketingCapture } from './marketingCapturePolicy';

export const readMarketingCapture = (search?: string) => resolveMarketingCapture(
  search ?? (typeof window === 'undefined' ? '' : window.location.search),
  {
  development: import.meta.env.DEV,
  test: import.meta.env.MODE === 'test',
  dedicatedCaptureBuild: import.meta.env.VITE_AVALA_MARKETING_CAPTURE === 'true',
  },
);
