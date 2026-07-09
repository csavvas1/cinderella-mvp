// The Cyprus cities the platform operates in. Used for cleaner service-area
// selection and for matching a booking's property to cleaners who cover it.
export const CY_CITIES = [
  "Limassol", "Nicosia", "Larnaca", "Paphos", "Paralimni", "Ayia Napa",
] as const;

// Pull the city out of a free-text address string. Addresses in this app end
// "...City NNNN" so a substring match is enough. Returns "" if none matches.
export function cityFromAddress(address: string): string {
  return CY_CITIES.find((c) => address.includes(c)) ?? "";
}

// Mock Cyprus address suggestions for the autocomplete.
// NOTE: real Google Places autocomplete needs a Google Maps API key + billing.
// This is a stand-in dataset so the typeahead UX works in the prototype.
export const ADDRESS_PRESETS: string[] = [
  "12 Amathus Avenue, Limassol 4532",
  "5 Spyrou Kyprianou, Limassol 3070",
  "28 Makarios III Avenue, Limassol 3105",
  "15 Anexartisias Street, Limassol 3040",
  "7 Georgiou A', Germasogeia, Limassol 4047",
  "3 Gladstonos Street, Limassol 3040",
  "21 Nikis Avenue, Nicosia 1086",
  "9 Stasinou Avenue, Nicosia 1060",
  "44 Makarios III Avenue, Nicosia 1065",
  "11 Themistokli Dervi, Nicosia 1066",
  "6 Finikoudes, Larnaca 6023",
  "18 Grigori Afxentiou, Larnaca 6021",
  "2 Athinon Avenue, Larnaca 6306",
  "30 Poseidonos Avenue, Paphos 8042",
  "14 Apostolou Pavlou Avenue, Paphos 8046",
  "8 Tombs of the Kings Road, Paphos 8045",
  "1 Protaras Avenue, Paralimni 5296",
  "25 Nissi Avenue, Ayia Napa 5330",
];
