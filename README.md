Gestor de Entregas Inteligente con Optimización de Rutas
https://screenshot.png

📌 Descripción
Aplicación web para gestión y optimización de rutas de entrega en tiempo real, con soporte para dispositivos móviles y desktop. Utiliza algoritmos de optimización geográfica y geolocalización para calcular la ruta más eficiente, considerando:

Ubicación actual del repartidor (vía GPS)

Proximidad entre puntos de entrega

Reordenamiento dinámico según movimiento

🌟 Características principales
🗺️ Funcionalidades del Mapa
Selección interactiva de puntos (clic largo en mapa)

Geocodificación inversa automática (coordenadas → dirección)

Visualización de rutas con diferentes estilos

Marcadores inteligentes con información relevante

📱 Soporte Multiplataforma
Interfaz responsive para móviles y desktop

Eventos táctiles optimizados para Android/iOS

Diseño adaptativo según tamaño de pantalla

Controles táctiles grandes y accesibles

🚀 Optimización de Rutas
Algoritmo del vecino más cercano para cálculo inicial

Reoptimización dinámica según movimiento

Priorización de entregas cercanas

Cálculo de distancias reales usando OSRM

📊 Gestión de Entregas
Listado interactivo de puntos de entrega

Marcado de entregas completadas

Notificaciones por proximidad

Persistencia de datos (localStorage)

🛠️ Tecnologías utilizadas
Frontend:

Leaflet.js (mapas interactivos)

Bootstrap 5 (interfaz responsive)

Web Geolocation API

APIs Externas:

OpenStreetMap (mapas base)

Nominatim (geocodificación)

OSRM (optimización de rutas)

🚀 Cómo usar
Agregar puntos de entrega:

Escribe una dirección o haz clic prolongado en el mapa

Confirma la ubicación en el diálogo emergente

Activar seguimiento GPS:

Toca "Activar GPS" para comenzar

La ruta se calculará automáticamente desde tu posición

Seguir la ruta optimizada:

La línea azul muestra el camino óptimo

Las tarjetas indican el orden de entrega

Notificaciones al acercarse a un punto

Marcar entregas completadas:

Usa el botón ✓ en cada tarjeta

La ruta se reoptimizará automáticamente

📂 Estructura del proyecto
text
/
├── index.html          # Interfaz principal
├── app.js              # Lógica de la aplicación
├── README.md           # Este archivo
└── assets/
    ├── screenshot.png  # Captura de pantalla
    └── sonido.mp3      # Audio para notificaciones


🌍 Demo en vivo
Ver demostración en GitHub Pages

📌 Requisitos
Navegador moderno (Chrome, Firefox, Safari)

Acceso a GPS (para seguimiento en tiempo real)

Conexión a Internet (para APIs de mapas)

⚠️ Limitaciones conocidas
Precisión de direcciones depende de OpenStreetMap

En áreas rurales puede haber menos detalle

Uso prolongado de GPS afecta batería en móviles

💡 Mejoras futuras
Integración con API de Google Maps

Modo offline con Service Workers

Exportación/importación de rutas

Compartir ubicación en tiempo real

📄 Licencia
Este proyecto está bajo licencia MIT. Ver archivo LICENSE para más detalles.
