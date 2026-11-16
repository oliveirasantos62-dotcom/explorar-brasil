export type BrazilianState = {
  code: string;
  name: string;
  abbreviation: string;
  region: "Norte" | "Nordeste" | "Centro-Oeste" | "Sudeste" | "Sul";
};

export const BRAZILIAN_STATES: BrazilianState[] = [
  { code: "11", name: "Rondônia", abbreviation: "RO", region: "Norte" },
  { code: "12", name: "Acre", abbreviation: "AC", region: "Norte" },
  { code: "13", name: "Amazonas", abbreviation: "AM", region: "Norte" },
  { code: "14", name: "Roraima", abbreviation: "RR", region: "Norte" },
  { code: "15", name: "Pará", abbreviation: "PA", region: "Norte" },
  { code: "16", name: "Amapá", abbreviation: "AP", region: "Norte" },
  { code: "17", name: "Tocantins", abbreviation: "TO", region: "Norte" },
  { code: "21", name: "Maranhão", abbreviation: "MA", region: "Nordeste" },
  { code: "22", name: "Piauí", abbreviation: "PI", region: "Nordeste" },
  { code: "23", name: "Ceará", abbreviation: "CE", region: "Nordeste" },
  { code: "24", name: "Rio Grande do Norte", abbreviation: "RN", region: "Nordeste" },
  { code: "25", name: "Paraíba", abbreviation: "PB", region: "Nordeste" },
  { code: "26", name: "Pernambuco", abbreviation: "PE", region: "Nordeste" },
  { code: "27", name: "Alagoas", abbreviation: "AL", region: "Nordeste" },
  { code: "28", name: "Sergipe", abbreviation: "SE", region: "Nordeste" },
  { code: "29", name: "Bahia", abbreviation: "BA", region: "Nordeste" },
  { code: "31", name: "Minas Gerais", abbreviation: "MG", region: "Sudeste" },
  { code: "32", name: "Espírito Santo", abbreviation: "ES", region: "Sudeste" },
  { code: "33", name: "Rio de Janeiro", abbreviation: "RJ", region: "Sudeste" },
  { code: "35", name: "São Paulo", abbreviation: "SP", region: "Sudeste" },
  { code: "41", name: "Paraná", abbreviation: "PR", region: "Sul" },
  { code: "42", name: "Santa Catarina", abbreviation: "SC", region: "Sul" },
  { code: "43", name: "Rio Grande do Sul", abbreviation: "RS", region: "Sul" },
  { code: "50", name: "Mato Grosso do Sul", abbreviation: "MS", region: "Centro-Oeste" },
  { code: "51", name: "Mato Grosso", abbreviation: "MT", region: "Centro-Oeste" },
  { code: "52", name: "Goiás", abbreviation: "GO", region: "Centro-Oeste" },
  { code: "53", name: "Distrito Federal", abbreviation: "DF", region: "Centro-Oeste" },
];

export const STATE_BY_CODE = new Map(BRAZILIAN_STATES.map((state) => [state.code, state]));
