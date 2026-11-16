export type NormalizedObservation = {
  region: string;
  period: string;
  value: number;
  geographyCode?: string;
  geographyLevel?: string;
};

export type ImportTarget = {
  slug: string;
  name: string;
  description: string;
  unit: string;
  periodicity: string;
  methodology: string;
  categorySlug: string;
  sourceName: string;
  sourceInstitution: string;
  sourceUrl: string;
  externalCode: string;
  geographyLevel?: string;
  fetch: () => Promise<NormalizedObservation[]>;
};

export type ImportResult = {
  source: string;
  indicator: string;
  status: "SUCCESS" | "EMPTY" | "FAILED" | "SKIPPED";
  records: number;
  message: string;
};
