import {
  SprayCan,
  Wrench,
  Droplets,
  PackageCheck,
  Flower2,
  Bug,
  LaptopMinimal,
  Users,
  Coffee,
  Toilet,
  ConciergeBell,
  Archive,
  Trees,
  Building2,
  Store,
  Warehouse,
  LayoutGrid,
  UsersRound,
  Handshake,
  Layers,
  PhoneCall,
  CircleHelp,
  Sparkle,
  type LucideProps,
} from 'lucide-react';
import type { Arrangement, FacilityId, ServiceId, WorkspaceType } from '../../shared/types';

type IconC = React.ComponentType<LucideProps>;

export const SERVICE_ICONS: Record<ServiceId, IconC> = {
  cleaning: SprayCan,
  maintenance: Wrench,
  drains: Droplets,
  hygiene: PackageCheck,
  scenting: Flower2,
  ddd: Bug,
};

export const FACILITY_ICONS: Record<FacilityId, IconC> = {
  work: LaptopMinimal,
  meeting: Users,
  kitchen: Coffee,
  toilets: Toilet,
  reception: ConciergeBell,
  storage: Archive,
  outdoor: Trees,
};

export const WORKSPACE_ICONS: Record<WorkspaceType, IconC> = {
  office: Building2,
  coworking: LayoutGrid,
  retail: Store,
  warehouse: Warehouse,
  other: Layers,
};

export const ARRANGEMENT_ICONS: Record<Arrangement, IconC> = {
  internal: UsersRound,
  one_provider: Handshake,
  several_providers: Layers,
  as_needed: PhoneCall,
  none: CircleHelp,
};

export const DeepCleanIcon = Sparkle;

export function ServiceIcon({ id, size = 20 }: { id: ServiceId; size?: number }) {
  const I = SERVICE_ICONS[id];
  return <I size={size} strokeWidth={1.75} aria-hidden />;
}
