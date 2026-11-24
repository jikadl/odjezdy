// Veřejná konfigurace tabulí: jen zastávky PID a trasy.
// Osobní údaje (souřadnice domova a práce, tempa, přirážky, sledované linky)
// v kódu NEJSOU – zadávají se v nastavení stránky (ozubené kolečko) a ukládají
// se jen v prohlížeči.
//
// GTFS ID stanovišť: https://data.pid.cz/stops/json/stops.json (pole "gtfsIds").
//
// Trasa (route):
//   stop     = výchozí stanoviště (veřejné souřadnice zastávky)
//   access   = jak se ke stanovišti dostanu: leg = klíč z nastavení (doma-petriny,
//              prace-invalidovna, prace-trznice) určuje chůzi/kolo; metro = +vstup-metro
//   alight   = výstupní stanoviště prvního spoje
//   transfer = přestup (min. minSec) na linky `lines` z boardIds do alight
//   finish   = cesta ze stanice do cíle: from = souřadnice stanice, to = doma/prace,
//              leg = způsob (chůze/kolo podle nastavení), metro = +vstup-metro
// Všechny časy jsou predikované, tj. včetně aktuálního zpoždění spojů.

window.TABLO_CONFIG = {
  boards: [
    {
      key: "petriny",
      button: "Petřiny",
      title: "Petřiny → kancelář",
      ride: { from: "doma", to: "prace" },            // tlačítka Uber + Google Maps
      location: { lat: 50.0875, lon: 14.3449, radiusKm: 3 }, // stanice Petřiny – automatický výběr tabule
      routes: [
        {
          lines: ["1"],
          stop: { id: "U507Z1P", name: "Petřiny", lat: 50.08826, lon: 14.34534 },
          access: { leg: "doma-petriny" },
          alight: { ids: ["U595Z2P"], name: "Hol. tržnice" },
          finish: { from: { lat: 50.09829, lon: 14.44467 }, to: "prace", leg: "prace-trznice" }
        },
        {
          // Tram 2 nejede na Hol. tržnici – přestup na Hradčanské
          lines: ["2"],
          stop: { id: "U507Z1P", name: "Petřiny", lat: 50.08826, lon: 14.34534 },
          access: { leg: "doma-petriny" },
          alight: { ids: ["U163Z1P"], name: "Hradčanská" },
          transfer: {
            minSec: 60,
            lines: ["1", "25"],
            boardIds: ["U163Z1P"],                    // Hradčanská A
            alight: { ids: ["U595Z2P"], name: "Hol. tržnice" },
            showLine: true
          },
          finish: { from: { lat: 50.09829, lon: 14.44467 }, to: "prace", leg: "prace-trznice" }
        },
        {
          lines: ["A"],
          stop: { id: "U507Z101P", name: "Petřiny", lat: 50.08707, lon: 14.34486 },
          access: { leg: "doma-petriny", metro: true },
          alight: { ids: ["U1072Z101P", "U1072Z102P"], name: "Můstek" },
          transfer: {
            minSec: 60,
            lines: ["B"],
            boardIds: ["U1072Z121P", "U1072Z122P"],   // Můstek, metro B
            alight: { ids: ["U655Z102P"], name: "Invalidovna" }
          },
          finish: { from: { lat: 50.09663, lon: 14.46248 }, to: "prace", leg: "prace-invalidovna", metro: true }
        }
      ]
    },
    {
      key: "rohanske",
      button: "Rohanské nábř.",
      title: "Kancelář → Petřiny",
      ride: { from: "prace", to: "doma" },
      location: { lat: 50.0973, lon: 14.4640, radiusKm: 3 }, // stanice Invalidovna
      routes: [
        {
          lines: ["B"],
          stop: { id: "U655Z101P", name: "Invalidovna", lat: 50.09663, lon: 14.46248 },
          access: { leg: "prace-invalidovna", metro: true },
          alight: { ids: ["U1072Z121P", "U1072Z122P"], name: "Můstek" },
          transfer: {
            minSec: 60,
            lines: ["A"],
            boardIds: ["U1072Z101P", "U1072Z102P"],   // Můstek, metro A
            alight: { ids: ["U507Z102P"], name: "Petřiny" }
          },
          finish: { from: { lat: 50.08707, lon: 14.34486 }, to: "doma", leg: "doma-petriny", metro: true }
        },
        {
          lines: ["1"],
          stop: { id: "U595Z1P", name: "Hol. tržnice", lat: 50.09834, lon: 14.44430 },
          access: { leg: "prace-trznice" },
          alight: { ids: ["U507Z2P"], name: "Petřiny" },
          finish: { from: { lat: 50.08826, lon: 14.34534 }, to: "doma", leg: "doma-petriny" }
        }
      ]
    }
  ],

  maxRows: 8,                 // kolik spojů ukázat
  minLeaveSec: -120,          // ukázat ještě spoje, na které jsem měl vyrazit před ≤ 2 min
  minutesAfter: 90,           // jak daleko dopředu hledat odjezdy
  refreshSeconds: 20,         // jak často stahovat nová data
  autoSelectByLocation: true  // po otevření vybrat tabuli podle polohy
};
