# Skin Cell Stimulation — Interactive Literature Review Dashboard

**[→ data.smart-biomaterials.com/stim-dashboard](https://data.smart-biomaterials.com/stim-dashboard)**

An open, interactive dataset and visualisation dashboard for the systematic data-driven review of in vitro electrical and mechanical stimulation of fibroblasts and keratinocytes. Built from 563 experimental conditions extracted from the peer-reviewed literature, with fold-change outcomes normalised to unstimulated controls.

> **Cite as:** Burgess MK, Marsh EF, Lucian VM, Nair M (2026). *A Data-Driven Review of in vitro Electrical and Mechanical Stimulation for Post-Acute Phase Wound Healing*. DOI: pending.

---

## Repository structure

```
├── index.html          # Dashboard UI — all chart/filter logic, no data embedded
├── data.json           # 563 experimental conditions (mechanical + electrical)
├── dose_data.json      # 164 dose-response records (charge, energy, power)
├── CITATION.cff        # Machine-readable citation (renders as "Cite this repo" on GitHub)
├── CNAME               # Custom domain for GitHub Pages (data.smart-biomaterials.com)
└── README.md
```

The HTML fetches the JSON files at runtime. **To add data, only edit the JSON files — never the HTML.**

---

## Dashboard features

- Filter by modality, cell type, outcome type, experimental model, and fold-change range
- **All sources / Paper only** toggle — provenance tracked per-record via `source` field
- Human in vitro · Mouse in vitro split throughout
- Mixed co-culture records excluded by default (toggle to include)
- Five chart views: Scatter, Distributions, Frequency, Duration, Dose response (charge/energy/power + KDE)
- Hover for parameters; click to open source paper DOI
- Low-n warnings with Adj. R² on dose plots when n is insufficient for trend lines

---

## Contributing new data

Edit `data.json` and open a pull request. Each entry = one experimental condition.

### Rules

1. `fold_change` = stimulated ÷ control
2. `doi` is required — used for deduplication
3. `source` = the DOI of the paper the data comes from
4. `cell_type`: `"Fibroblast"` (includes HDFs), `"Keratinocyte"`, `"Mixed"`
5. `model`: `"Human in vitro"`, `"Mouse in vitro"`, or `"In vivo"`
6. In vitro only — no in vivo, no clinical, no review articles
7. Original research with stimulated vs. unstimulated control only

### Schema

| Field | Type | Required | Description |
|---|---|---|---|
| `stim_modality` | string | ✓ | `"Mechanical"` or `"Electrical"` |
| `paper` | string | ✓ | Author(s), Year |
| `doi` | string | ✓ | Full DOI URL |
| `source` | string | ✓ | DOI of source paper |
| `cell_type` | string | ✓ | `"Fibroblast"`, `"Keratinocyte"`, `"Mixed"` |
| `model` | string | ✓ | `"Human in vitro"`, `"Mouse in vitro"`, `"In vivo"` |
| `outcome_type` | string | ✓ | `"Proliferation"`, `"Migration"`, `"Morphology"`, `"Viability"` |
| `outcome_raw` | string | ✓ | Exact outcome label from paper |
| `fold_change` | number | ✓ | Stimulated ÷ Control |
| `frequency_hz` | number\|null | | Hz |
| `pulse_duration_ms` | number\|null | | ms |
| `stim_duration_hrs` | number\|null | | hours |
| `strain_amplitude_pct` | number\|null | | % strain |
| `field_strength_mv_mm` | number\|null | | mV/mm |
| `voltage_v` | number\|null | | V |
| `waveform` | string\|null | | e.g. `"DC"`, `"Sinusoidal"`, `"Square"` |
| `electrode_material` | string\|null | | e.g. `"Ag/AgCl"`, `"Pt"` |
| `substrate_stiffness_kpa` | number\|null | | kPa |
| `displacement_um` | number\|null | | µm |
| `species` | string\|null | | e.g. `"Human"`, `"Murine"` |

### Example

```json
{
  "stim_modality": "Electrical",
  "paper": "Smith et al., 2024",
  "doi": "https://doi.org/10.1234/example",
  "source": "https://doi.org/10.1234/example",
  "cell_type": "Fibroblast",
  "model": "Human in vitro",
  "species": "Human",
  "stim_type": "DC electric field",
  "waveform": "DC",
  "electrode_material": "Ag/AgCl",
  "outcome_type": "Proliferation",
  "outcome_raw": "Cell count (normalised)",
  "fold_change": 1.35,
  "frequency_hz": null,
  "pulse_duration_ms": null,
  "stim_duration_hrs": 24,
  "voltage_v": 0.1,
  "field_strength_mv_mm": 50
}
```

---

## Setup & deployment

### Custom domain (already configured)

The `CNAME` file points GitHub Pages to `data.smart-biomaterials.com`. Your DNS needs:

```
CNAME  data  SMART-Biomaterials.github.io
```

### Updating the paper DOI when published

Two places:

```
index.html   →  href="https://doi.org/XXXXXX" (search for paper-doi-link)
CITATION.cff →  doi: "XXXXXX"
```

### If forking / rehosting

1. Fork repo → Settings → Pages → source: `main` / root
2. Update `CNAME` with your domain (or delete it for the default `.github.io` URL)
3. Update author info in `CITATION.cff`

---

## Provenance

Original paper records: `"source": "Burgess2026"`
Community records: `"source": "<doi of source paper>"`

The **Paper only** toggle filters exclusively to `Burgess2026` records, allowing exact reproduction of the published analysis. Raw pre-normalisation extraction data: Oxford University Research Archive at `https://doi.org/XXXXXX`.

---

## Licence

Code: [MIT](LICENSE) · Dataset: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

---

## Acknowledgements

MKB: EPSRC DTP (EP/W524311/1) · EFM: EPSRC/BBSRC CDT Engineering Biology (EP/Y034791/1) · VML: The Rhodes Scholarship · MN: EPSRC BIONIC Hearts New Investigator Award (EP/Y004434/1)
