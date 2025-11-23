
# Frontend - Detección de Puentes en Grafos

Este frontend estático (HTML, CSS y JS) permite:

- Dibujar grafos manualmente con nodos y conectores.
- Generar grafos aleatorios conectados entre 5 y 8 nodos, con alta probabilidad de tener puentes.
- Enviar el grafo a una API FastAPI para detectar puentes.
- Mostrar si el grafo tiene o no puentes y resaltarlos.

## Publicación en Netlify

1. Sube esta carpeta (o un zip con **index.html**, **styles.css** y **app.js**) a Netlify usando **"Deploy site"** (drag & drop).
2. Asegúrate de que tu API FastAPI esté desplegada (por ejemplo, en Render).
3. Edita la constante `API_BASE` en `app.js` para apuntar a la URL pública de tu API, por ejemplo:

   ```js
   const API_BASE = "https://tu-api-grafos.onrender.com";
   ```
