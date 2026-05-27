# film-calculator

> **Fork** of [andikaraditya/film-calculator](https://github.com/andikaraditya/film-calculator) — modernised UI, dynamic `config.yaml` data loading, film brand/stock picker, and side-by-side roll comparison.

Calculate the **cost per exposure** and **cost per square millimetre** for analog film rolls. Compare multiple rolls to find the best value.

[**Open Calculator**](https://MohamedSibaaq.github.io/film-calculator/)

## Features

- **Dynamic config** — film formats, brands, and stocks all come from `config.yaml`; no JS edits needed to add a new stock
- **Film stock picker** — browse Kodak, Fujifilm, Ilford, Lomography, CineStill and more; each stock shows ISO and type (Color / B&W / Slide)
- **Comparison table** — side-by-side cost breakdown across all rolls, with the cheapest highlighted automatically
- **Drag-to-reorder** — rearrange rolls by dragging
- **Auto-save** — data persists in `localStorage` across page reloads
- Up to 10 simultaneous rolls
- Fully responsive (mobile-friendly)

## Configuration

All primary data lives in [`config.yaml`](config.yaml).

| Section | Purpose |
|---|---|
| `site` | Page title, author credits, repository URLs |
| `app` | `max_rolls`, `default_rolls` on first load |
| `film_formats` | Format label, selector value, and exposure area in sq. mm |
| `film_brands` | Brands with their film stocks (name, ISO, type) |

### Adding a film stock

```yaml
film_brands:
  - brand: "My Brand"
    films:
      - { name: "My Film 400", iso: 400, type: color }
```

Valid types: `color`, `bw`, `slide`

### Adding a film format

```yaml
film_formats:
  - { label: "6x17 Panoramic", value: "617", area_sqmm: 10200 }
```

## Local development

The app fetches `config.yaml` at runtime, so it must be served over HTTP (not opened as a file):

```bash
# Python
python -m http.server 8080

# Node.js
npx serve .
```

Then open `http://localhost:8080`.

## Demo

![demo](assets/demo.gif)

## Credits

Original project created by [**andikaraditya**](https://github.com/andikaraditya) — [andikaraditya/film-calculator](https://github.com/andikaraditya/film-calculator)

This fork maintained by [**MohamedSibaaq**](https://github.com/MohamedSibaaq).

## License

[MIT](LICENSE)
