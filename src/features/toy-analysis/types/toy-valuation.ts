export type ToyValuation = {
  id: string;
  toyAnalysisItemId: string;
  estimatedValueDenars: number;
  confidence: number | null;
  valuationMethod: string;
  valuationVersion: string;
  createdAt: string;
};
