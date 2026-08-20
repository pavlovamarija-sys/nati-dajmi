export type AgeUnit = 'months' | 'years';

export type ToyRecommendation = 'KEEP' | 'ROTATE' | 'PASS_ON';

export type PlayIdea = {
  title: string;
  description: string;
};

export type ToyBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DetectedToyCandidate = {
  candidateId: string;
  confidence: number;
  boundingBox: ToyBoundingBox;
};

export type LocalToyCandidateImage = DetectedToyCandidate & {
  imageUri: string;
  semanticImageBase64: string;
};

export type SupportedImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export type ChildAge = {
  value: number;
  unit: AgeUnit;
};

export type ToyShelfImage = {
  uri: string;
  width: number;
  height: number;
  fileName?: string | null;
  mimeType?: string | null;
};

export type ImageSelectionResult =
  | { status: 'selected'; image: ToyShelfImage }
  | { status: 'cancelled' }
  | { status: 'permission-denied' }
  | { status: 'error' };

export type ToyAnalysisItem = {
  id: string;
  name: string;
  category: string | null;
  recommendation: ToyRecommendation;
  reason: string;
  confidence: number | null;
  playIdeas: PlayIdea[];
  boundingBox: ToyBoundingBox | null;
  cropExpected: boolean;
  imagePath?: string | null;
  imageUri?: string;
};

export type ToyAnalysisResult = {
  analysisId: string;
  childAgeMonths: number;
  toys: ToyAnalysisItem[];
};

export type ToyAnalysisHistoryItem = {
  analysisId: string;
  childAgeMonths: number;
  createdAt: string;
  toyCount: number;
};
