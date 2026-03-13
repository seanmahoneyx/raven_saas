import type { BoxType } from '@/types/api'

/** Canonical list of box types used across the priority list module. */
export const BOX_TYPES: BoxType[] = ['RSC', 'DC', 'HSC', 'FOL', 'TELE', 'OTHER']

/** Sort order for box types: RSC first, then DC, then others. */
export const BOX_TYPE_ORDER: Record<string, number> = {
  RSC: 1,
  DC: 2,
  HSC: 3,
  FOL: 4,
  TELE: 5,
  OTHER: 6,
}
