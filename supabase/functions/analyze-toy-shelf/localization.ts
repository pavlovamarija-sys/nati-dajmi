export type NormalizedBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ToyLocalizationQuery = {
  toyId: string;
  query: string;
};

export type ToyLocalization = {
  toyId: string;
  query: string;
  confidence: number | null;
  boundingBox: NormalizedBoundingBox;
};

export type ToyLocalizationInput = {
  imageDataUrl: string;
  imageWidth: number;
  imageHeight: number;
  toyQueries: ToyLocalizationQuery[];
};

export interface ToyObjectLocalizationProvider {
  localizeToys(input: ToyLocalizationInput): Promise<ToyLocalization[]>;
}
