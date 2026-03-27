import type {
  DivisionType, ItemType, TestType, FluteType, PaperType,
  PackagingSubType,
} from '@/types/api'

// ─── Division & Box Type choices ────────────────────────────────────────────

export const DIVISIONS: { value: DivisionType; label: string }[] = [
  { value: 'corrugated', label: 'Corrugated' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'tooling', label: 'Tooling' },
  { value: 'janitorial', label: 'Janitorial' },
  { value: 'misc', label: 'Miscellaneous' },
]

export const BOX_TYPES: { value: ItemType; label: string }[] = [
  { value: 'rsc', label: 'RSC - Regular Slotted Container' },
  { value: 'hsc', label: 'HSC - Half Slotted Container' },
  { value: 'fol', label: 'FOL - Full Overlap' },
  { value: 'dc', label: 'DC - Die Cut' },
  { value: 'tele', label: 'Tele - Telescoping' },
]

export const TEST_TYPES: { value: TestType; label: string }[] = [
  { value: 'ect29', label: 'ECT 29' },
  { value: 'ect32', label: 'ECT 32' },
  { value: 'ect40', label: 'ECT 40' },
  { value: 'ect44', label: 'ECT 44' },
  { value: 'ect48', label: 'ECT 48' },
  { value: 'ect51', label: 'ECT 51' },
  { value: 'ect55', label: 'ECT 55' },
  { value: 'ect112', label: 'ECT 112' },
  { value: '200t', label: '200T' },
]

export const FLUTE_TYPES: { value: FluteType; label: string }[] = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
  { value: 'c', label: 'C' },
  { value: 'e', label: 'E' },
  { value: 'f', label: 'F' },
  { value: 'bc', label: 'BC DW' },
  { value: 'eb', label: 'EB DW' },
  { value: 'tw', label: 'TW' },
]

export const PAPER_TYPES: { value: PaperType; label: string }[] = [
  { value: 'k', label: 'Kraft' },
  { value: 'mw', label: 'Mottled White' },
]

// ─── Packaging sub-type choices ─────────────────────────────────────────────

export const PKG_SUB_TYPES: { value: PackagingSubType; label: string }[] = [
  { value: 'bags', label: 'Bags' },
  { value: 'bubble', label: 'Bubble' },
  { value: 'chipboard', label: 'Chipboard' },
  { value: 'circles', label: 'Circles' },
  { value: 'collars', label: 'Collars' },
  { value: 'corners', label: 'Corners' },
  { value: 'film', label: 'Film' },
  { value: 'foam', label: 'Foam' },
  { value: 'labels', label: 'Labels' },
  { value: 'partitions', label: 'Partitions' },
  { value: 'plastic_containers', label: 'Plastic Containers/Lids' },
  { value: 'specialty_paper', label: 'Specialty Paper' },
  { value: 'strapping', label: 'Strapping' },
  { value: 'stretch', label: 'Stretch' },
  { value: 'tape', label: 'Tape' },
  { value: 'tube', label: 'Tube' },
  { value: 'pkg_misc', label: 'Misc' },
]

// ─── Packaging field visibility per sub-type ────────────────────────────────
// Keys match API/model field names. Values are the sub-types that show that field.

export const PKG_FIELD_VISIBILITY: Record<string, PackagingSubType[]> = {
  material_type: ['bags','bubble','chipboard','circles','collars','corners','film','foam','labels','partitions','plastic_containers','specialty_paper','strapping','stretch','tape','tube','pkg_misc'],
  color: ['bags','bubble','chipboard','circles','collars','corners','film','foam','labels','partitions','plastic_containers','specialty_paper','strapping','stretch','tape','tube'],
  thickness: ['bags','bubble','chipboard','circles','collars','corners','film','foam','partitions','plastic_containers','specialty_paper','strapping','stretch','tape','tube'],
  length: ['bags','bubble','chipboard','collars','corners','foam','labels','partitions','plastic_containers','specialty_paper','tube'],
  width: ['bags','bubble','chipboard','collars','foam','labels','partitions','plastic_containers','specialty_paper','tape'],
  height: ['bags','collars','corners','foam','partitions','plastic_containers','tube'],
  diameter: ['circles','plastic_containers','tube'],
  roll_length: ['bubble','film','foam','specialty_paper','strapping','stretch','tape'],
  roll_width: ['bubble','film','foam','specialty_paper','strapping','stretch','tape'],
  rolls_per_case: ['bubble','film','strapping','stretch','tape'],
  core_diameter: ['bubble','film','strapping','stretch','tape'],
  sheets_per_bundle: ['chipboard','circles','foam','labels','partitions','specialty_paper'],
  pieces_per_case: ['bags','chipboard','circles','collars','corners','foam','labels','partitions','plastic_containers','specialty_paper','tube'],
  weight_capacity_lbs: ['bags','corners','plastic_containers','strapping','tape','tube'],
  bubble_size: ['bubble'],
  perforated: ['bubble','film'],
  perforation_interval: ['bubble','film'],
  lip_style: ['bags'],
  density: ['foam'],
  cells_x: ['partitions'],
  cells_y: ['partitions'],
  adhesive_type: ['tape','labels'],
  tape_type: ['tape'],
  break_strength_lbs: ['strapping'],
  stretch_pct: ['stretch'],
  inner_diameter: ['tube'],
  lid_included: ['plastic_containers'],
  label_type: ['labels'],
  labels_per_roll: ['labels'],
}

export function showPkgField(field: string, subType: string): boolean {
  return PKG_FIELD_VISIBILITY[field]?.includes(subType as PackagingSubType) ?? false
}
