export type ToyValuationInput = {
  toyAnalysisItemId: string;
  name: string;
  category: string | null;
  imageUri?: string;
  imagePath?: string | null;
};

export type ToyValuationMetadata = {
  valuationMethod: string;
  valuationVersion: string;
};

export type ToyValuationResult = {
  estimatedValueDenars: number;
  confidence: number | null;
  metadata: ToyValuationMetadata;
};

export interface ToyValuationService {
  valueToy(input: ToyValuationInput): Promise<ToyValuationResult>;
}

export type ToyValuationProvider = (
  input: ToyValuationInput,
) => Promise<ToyValuationResult>;
