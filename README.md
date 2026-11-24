# Odjezdy

Odjezdová tabule PID pro dojíždění Petřiny ↔ Invalidovna / Holešovická tržnice,
hostovaná na GitHub Pages: <https://jikadl.github.io/odjezdy/>

V kódu nejsou žádné osobní údaje. Souřadnice domova a práce, tempa, přirážky
a sledované linky se zadávají v nastavení stránky a ukládají se jen v prohlížeči.

## Přepínač nahoře

- **Petřiny** (`#petriny`) – tram 1 z Petřin A přímo na Holešovickou tržnici,
  tram 2 s přestupem na Hradčanské na tram 1 nebo 25 do Holešovické tržnice,
  metro A z Petřin s přestupem na Můstku na metro B do Invalidovny.
- **Rohanské nábř.** (`#rohanske`) – metro B z Invalidovny s přestupem na Můstku na metro A
  do Petřin a tram 1 z Holešovické tržnice do Petřin.

Vedle přepínače jsou tlačítka **Uber** a **Trasa autem (Google Maps)**. Pokud jsou v nastavení
místa pro taxi (`taxi-N`), tlačítka nabídnou podmenu: do práce z vybraného místa, domů na vybrané
místo. Bez nich se jede mezi `doma` a `prace`.

Po otevření se stránka zeptá na polohu a do 3 km od stanice Petřiny / Invalidovna vybere
příslušnou tabuli. Ruční kliknutí má přednost.

## Sloupce tabulky

| Sloupec | Význam |
|---|---|
| **Vyrazit** | odpočet, kdy vyjít z aktuální polohy (bez polohy od `doma` / `prace`). Ukazují se i spoje, na které jsem měl vyrazit nejvýš před 2 minutami. |
| **Odjezd** | odpočet do odjezdu spoje + čas odjezdu a zpoždění |
| **V cíli** | příchod domů / do práce |
| řádek pod tím | výstupní zastávka, přestup (min. 1 min) a příjezd |

Zelený řádek = spoj, se kterým budu v cíli nejdřív. Všechny časy jsou predikované, tj. včetně zpoždění.

## Nastavení (ozubené kolečko)

Dvě pole: **API klíč Golemio** (zdarma na <https://api.golemio.cz/api-keys/>) a **osobní nastavení**,
jedna položka na řádek nebo oddělené středníkem:

```
prace = 50.1234567N, 14.1234567E   # nebo 50.12345, 14.12345
doma = 50.12345, 14.12345
chuze = 12                # tempo chůze, min/km
kolo = 4                  # tempo na kole, min/km
koef = 1,3                # vzdušná čára → skutečná cesta (1,3 i 1.3)
doma-petriny = kolo       # kolo / chůze
prace-invalidovna = chuze
prace-trznice = kolo
vstup-metro = 45s         # přirážka do metra i z metra
vstup-prace = 60s         # přirážka na vstup do práce
kolo-navic = 30s          # přirážka za každý úsek na kole
hlidane-linky = A,B,1,2,25
taxi-1 = Název místa      # místa pro Uber / trasu autem (taxi-1 … taxi-9)
taxi-1-gps = 50.12345, 14.12345
taxi-2 = Jiné místo
taxi-2-gps = 50.12345, 14.12345
```

Úsek pěšky / na kole = vzdušná vzdálenost × `koef` × tempo (+ `kolo-navic`).
Tlačítko **Odkaz do mobilu** vytvoří odkaz `…#nastaveni=…`, který po otevření uloží klíč
i nastavení do dalšího zařízení a z adresy se hned smaže (část za `#` se na server neposílá).

Diagnostika načítání dat: `…/odjezdy/?debug=1`.

## Úpravy tras

Zastávky a trasy jsou v `config.js`, čtení nastavení v `settings.js`.
