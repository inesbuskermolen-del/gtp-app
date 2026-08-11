export interface LatLon {
  lat: number;
  lon: number;
}

export interface GeocodeResult extends LatLon {
  displayName: string;
  suburb: string;
  postcode: string;
  state: string;
  raw: unknown;
  _source: string;
}

export type TransportItemType = 'train' | 'tram' | 'bus' | 'carShare';

export interface TransportItem {
  name: string;
  distanceM: number;
  distanceLabel: string;
  walkMinutes: number;
  tags: Record<string, string>;
}

export interface TransportSummary {
  searchRadiusM: number;
  train: TransportItem[];
  tram: TransportItem[];
  bus: TransportItem[];
  carShare: TransportItem[];
  cyclingInfraCount: number;
  indicativeWalkability: number;
  _source: string;
  /** Set when the live Overpass lookup failed after retries — the section
   * should read as "not verified", not as "zero infrastructure nearby". */
  _error?: string;
}

export interface CouncilSourceDocument {
  title: string;
  url: string;
}

export type ProfileDepth = 'detailed' | 'generic';

export interface CouncilProfile {
  id: string;
  name: string;
  profileDepth: ProfileDepth;
  suburbs: string[];
  lgaNames: string[];
  visionStatement: string;
  strategicPriorities: string[];
  quantifiedTargets: string[];
  sourceDocuments: CouncilSourceDocument[];
  actionWeights: Record<string, number>;
  policyNarrative: string;
}

export type MatchConfidence =
  | 'lga-polygon-matched'
  | 'suburb-matched-fallback'
  | 'lga-matched-no-detailed-profile'
  | 'no-match-generic-fallback'
  | 'outside-victoria';

export interface CouncilMatch {
  council: CouncilProfile;
  matchConfidence: MatchConfidence;
  matchedLgaName?: string;
}

export type DevelopmentType =
  | 'residential'
  | 'mixedUse'
  | 'commercialOffice'
  | 'retail'
  | 'education'
  | 'industrial';

export interface GtpRequest {
  address: string;
  developmentType: DevelopmentType;
  scale?: string;
  siteDescription?: string;
  clientName?: string;
  projectReference?: string;
}

export interface ActionItem {
  category: string;
  text: string;
  score: number;
  priority: boolean;
}

export interface TargetItem {
  text: string;
  source: string;
  sourced: boolean;
}
