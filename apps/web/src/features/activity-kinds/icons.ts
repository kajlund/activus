import {
  Activity,
  Footprints,
  Bike,
  Waves,
  Dumbbell,
  PersonStanding,
  createElement,
} from 'lucide';
import type { ActivityKind } from '@activus/contracts';
const icons = {
  activity: Activity,
  footprints: Footprints,
  bike: Bike,
  waves: Waves,
  dumbbell: Dumbbell,
  'person-standing': PersonStanding,
};
export const iconLabels: Record<ActivityKind['iconName'], string> = {
  activity: 'Activity',
  footprints: 'Footprints',
  bike: 'Bike',
  waves: 'Waves',
  dumbbell: 'Dumbbell',
  'person-standing': 'Person standing',
};
export function activityIcon(name: string) {
  return createElement(icons[name as keyof typeof icons] ?? Activity, {
    width: '24',
    height: '24',
    'stroke-width': '1.75',
    'aria-hidden': 'true',
    focusable: 'false',
  });
}
