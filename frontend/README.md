# Frontend

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Folder Structure

```bash
frontend/                             # Frontend layer
    ├── node_modules/                 # Warehouse of all installed dependencies (auto-generated, do not edit)
    │
    ├── public/                       # Static assets served as-is (images, favicon, robots.txt)
    │     └─ index.html
    │
    ├── src/                          # Application source code (components, pages, styles, utils)
    │     ├─ api/                     # Axios/fetch functions for backend API calls
    │     │    ├─ auth.js
    │     │    └─ notes.js
    │     │                   
    │     ├─ assets/
    │     │    └─ react.svg
    │     │
    │     ├─ components/              # Reusable components
    │     │    ├─ NoteCard.jsx
    │     │    ├─ NoteEditor.jsx
    │     │    ├─ Dashboard.jsx
    │     │    └─ AIActionPanel.jsx
    │     │
    │     ├─ context/                 # React Context for global state (auth, notes)
    │     │    └─ AuthContext.jsx
    │     │
    │     ├─ pages/                   # Page-level components
    │     │    ├─ Login.jsx
    │     │    ├─ Register.jsx
    │     │    ├─ NotesDashboard.jsx
    │     │    └─ SkillReviewer.jsx
    │     │
    │     ├─ styles/                  # CSS or SCSS files
    │     │
    │     ├─ App.css
    │     ├─ App.jsx
    │     ├─ main.css
    │     └─ main.jsx
    │
    ├── DevNotes.md                   # Frontend developer notes
    ├── eslint.config.js              # ESLint configuration (rules, plugins, environments)
    ├── index.html                    # Entry point of the app (contains <div id="root"></div>)
    ├── package-lock.json             # Exact versions of all dependencies for reproducible builds
    ├── package.json                  # Project metadata, dependencies, and scripts
    ├── README.md                     # Project overview, instructions
    └── vite.config.js                # Vite configuration (plugins, build & dev server settings)
```


