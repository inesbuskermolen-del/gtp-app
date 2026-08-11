export type DevelopmentType = 'residential' | 'mixedUse' | 'commercialOffice' | 'retail' | 'education' | 'industrial';

export interface GtpRequest {
  address: string;
  developmentType: DevelopmentType;
  scale?: string;
  siteDescription?: string;
  clientName?: string;
  projectReference?: string;
}

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
  _error?: string;
}

export interface TargetItem {
  text: string;
  source: string;
  sourced: boolean;
}

export interface ActionItem {
  category: string;
  text: string;
  score: number;
  priority: boolean;
}

export interface GtpContent {
  meta: {
    address: string;
    lat: number;
    lon: number;
    developmentType: DevelopmentType;
    developmentTypeLabel: string;
    scale: string;
    siteDescription: string;
    clientName: string;
    projectReference: string;
    generatedDate: string;
    council: { id: string; name: string; profileDepth: string };
    matchConfidence: string;
    matchedLgaName?: string;
    dataSources: { geocode: string; transport: string };
  };
  draftBanner: string;
  sourcesOfInformation: string[];
  summary: string;
  introduction: string;
  gtpIntro: string;
  subjectSiteNarrative: string;
  transport: TransportSummary;
  policyNarrative: string;
  targets: TargetItem[];
  actionsByCategory: Record<string, ActionItem[]>;
  monitoringAndReporting: string;
}

export const ACTION_CATEGORY_LABELS: Record<string, string> = {
  walking: 'Walking',
  cycling: 'Cycling',
  endOfTripFacilities: 'End of Trip Facilities',
  publicTransport: 'Public Transport',
  carpoolingCarShare: 'Carpooling & Car Share Schemes',
  carParking: 'Car Parking',
  travelForWorkAmenities: 'Travel for Work / Amenities',
  management: 'Management',
};

export const DEVELOPMENT_TYPE_OPTIONS: { value: DevelopmentType; label: string }[] = [
  { value: 'residential', label: 'Residential' },
  { value: 'mixedUse', label: 'Mixed-use' },
  { value: 'commercialOffice', label: 'Commercial office' },
  { value: 'retail', label: 'Retail' },
  { value: 'education', label: 'Education' },
  { value: 'industrial', label: 'Industrial / warehouse' },
];
