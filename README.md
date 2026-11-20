# Mohieddine Abassi — Personal Frontend Developer Portfolio

Interactive frontend portfolio built around a draggable desktop canvas, case study drawers, and a responsive touch card stack. Showcases 10 selected client projects across WordPress, WooCommerce, Elementor, Divi, and custom frontend architecture.

🔗 **Live Demo:** 
[Github](https://mohieddine-abassi.pages.dev)
[Cloudflare](https://portfolio.mohiedineabassi.workers.dev/)
---

## Highlights & Features

- **Interactive Desktop Workspace:** Freeform pan-and-drag canvas using native Pointer Events, custom velocity inertia (`requestAnimationFrame`), and dynamic z-index stacking.
- **Responsive Touch Card Stack:** Automatically switches on viewports `< 980px` or coarse pointers to a swipeable card carousel with velocity detection.
- **Slide-Over Case Studies:** Built on the native `<dialog>` element with focus trapping, keyboard navigation (`Esc`, `Tab`, arrow keys), and lazy-loaded device previews.
- **Category Filtering & Theme Switch:** Instant filtering (`E-commerce`, `Experiences`, `Services`) and persistent Dark/Light mode stored in `localStorage`.
- **Zero Build Step:** Pure HTML5, modern CSS (custom properties, `color-mix()`, `100dvh`, individual `translate` properties), and JavaScript/jQuery with automatic local fallback if the CDN is unreachable.

---

## Project Structure

```text
├── index.html                      # Semantic markup, SVG sprite & <template> case studies
├── style.css                       # Design tokens, dark/light themes, canvas & responsive layouts
├── script.js                       # Pointer drag/swipe engine, drawer state & animations
├── assets/
│   ├── jquery-3.7.1.min.js         # Local jQuery fallback
│   ├── mohieddine.webp              # Profile portrait
│   └── *-devices.webp / *.png       # Desktop & multi-device screenshots for 10 projects
└── README.md
```

---

## Featured Projects

1. **The Window Cleaning Market** — International B2B/B2C WooCommerce store with custom tax tables and checkout calculations.
2. **Les Grandes Oreilles** — Event & outdoor retreat showcase with live Instagram feed integration.
3. **Classic Vintage Car** — Swiss collector car brokerage built with WooCommerce, ACF, and multi-criteria filtering.
4. **ReviewBloom** — B2B local SEO & Google review management SaaS website.
5. **Stop & Motion** — Audiovisual & 2D/3D motion studio portfolio optimized for video performance.
6. **Atelier des Lofts Thonon** — Real estate renovation and architectural gallery website.
7. **Legend Chamonix** — Multilingual outdoor retail store and online bike rental booking platform.
8. **Medical Santé Pro** — Multilingual B2B medical supply e-commerce catalogue.
9. **Invest Prestige** — Wealth management and real estate advisory showcase.
10. **Les Vieux Safrans d'Annecy** — Maritime heritage association portal.

---

## Local Development & Deployment

No bundler or Node.js dependencies are required.

```bash
# Clone the repository
git clone https://github.com/mohiedine-abassi/mohieddine-portfolio.git

# Open directly in browser or serve locally
npx serve .
```

**Deployment:** Compatible out of the box with **Cloudflare Pages**, **GitHub Pages**, and **Netlify** (static root deployment, no build command needed).

---

## Contact

- **Upwork:** [Top Rated Freelancer — 100% Job Success](https://www.upwork.com/freelancers/~01568f6959753d0af0)
- **LinkedIn:** [linkedin.com/in/mohieddineabassi](https://www.linkedin.com/in/mohieddineabassi/)
- **Email:** [mohiedineabassi@gmail.com](mailto:mohiedineabassi@gmail.com)