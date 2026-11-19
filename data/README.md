# Data mapy

Hra načítá `data/praha.geojson`. Pokud soubor chybí, použije `data/sample-district.geojson`,
což je **syntetická ukázka (není to reálná Praha)** a v HUD je to označeno.

## Jak získat reálná data Prahy (OpenStreetMap, licence ODbL)

1. Otevři https://overpass-turbo.eu
2. Vlož dotaz (oblast Staré Město / Malá Strana / Vltava):

```
[out:json][timeout:120];
(
  way["building"](50.0790,14.4000,50.0960,14.4330);
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|service|pedestrian|footway|cycleway|path|steps)$"](50.0790,14.4000,50.0960,14.4330);
  way["waterway"="river"](50.0790,14.4000,50.0960,14.4330);
  way["natural"="water"](50.0790,14.4000,50.0960,14.4330);
  relation["building"]["type"="multipolygon"](50.0790,14.4000,50.0960,14.4330);
);
out geom;
```

Nebo jedním příkazem přímo z projektu (potřebuje internet): `npm run fetch-osm` – uloží `data/praha.geojson`.

Ručně (alternativa):
4. Obnov hru. Výchozí poloměr je 1200 m od Staroměstského náměstí, lze změnit parametrem `?radius=900`.

Je nutné uvést zdroj: © přispěvatelé OpenStreetMap.
