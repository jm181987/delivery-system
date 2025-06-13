// Configuración inicial
let direcciones = JSON.parse(localStorage.getItem("entregas")) || [];
let mapa, marcadores = [], marcadorUsuario = null;
let rutaOptimizada = [], polyline = null;
let watchId = null, posicionActual = null;
let isAndroid = /android/i.test(navigator.userAgent);

// Inicialización optimizada para Android
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Configuración especial para Android
    mapa = L.map('mapa', {
      tap: false,
      touchZoom: true,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      dragging: true,
      attributionControl: false
    }).setView([0, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      detectRetina: true
    }).addTo(mapa);

    // Eventos táctiles mejorados
    mapa.on('touchstart', handleTouchStart);
    mapa.on('touchend', handleTouchEnd);
    mapa.on('touchmove', handleTouchMove);

    // Cargar entregas existentes
    direcciones.forEach(d => agregarMarcador(d));
    mostrarDirecciones();
    
  } catch (error) {
    alert("Error al cargar el mapa: " + error.message);
  }
});

// Manejo de eventos táctiles
let longPressTimer;
let touchMoved = false;

function handleTouchStart(e) {
  if (e.originalEvent.touches.length > 1) return;
  
  touchMoved = false;
  const touch = e.originalEvent.touches[0];
  const latlng = mapa.containerPointToLatLng(L.point(touch.clientX, touch.clientY));
  
  longPressTimer = setTimeout(() => {
    if (!touchMoved) {
      mostrarPrevisualizacion(latlng, touch);
    }
  }, 600); // 600ms para long press
}

function handleTouchMove(e) {
  touchMoved = true;
  clearTimeout(longPressTimer);
  if (previewMarker) {
    const touch = e.originalEvent.touches[0];
    const latlng = mapa.containerPointToLatLng(L.point(touch.clientX, touch.clientY));
    previewMarker.setLatLng(latlng);
    updateTooltipPosition(touch);
  }
}

function handleTouchEnd(e) {
  clearTimeout(longPressTimer);
  if (previewMarker && !touchMoved) {
    confirmarAgregarPunto(previewMarker.getLatLng());
  }
  limpiarPrevisualizacion();
}

// Funciones de previsualización
let previewMarker, tooltip;

function mostrarPrevisualizacion(latlng, touch) {
  limpiarPrevisualizacion();
  
  previewMarker = L.marker(latlng, {
    icon: L.divIcon({
      className: 'preview-marker',
      iconSize: [30, 30]
    }),
    interactive: false
  }).addTo(mapa);

  // Tooltip móvil
  tooltip = document.createElement('div');
  tooltip.className = 'map-tooltip';
  tooltip.textContent = 'Suelta para agregar';
  document.body.appendChild(tooltip);
  updateTooltipPosition(touch);
}

function updateTooltipPosition(touch) {
  if (tooltip) {
    tooltip.style.left = `${touch.clientX + 20}px`;
    tooltip.style.top = `${touch.clientY - 40}px`;
  }
}

function limpiarPrevisualizacion() {
  if (previewMarker) {
    mapa.removeLayer(previewMarker);
    previewMarker = null;
  }
  if (tooltip) {
    tooltip.remove();
    tooltip = null;
  }
}

// Funciones principales (simplificadas para Android)
async function confirmarAgregarPunto(latlng) {
  const direccion = await obtenerDireccionDesdeCoordenadas(latlng.lat, latlng.lng);
  
  if (direccion) {
    const nuevaEntrega = {
      direccion,
      lat: latlng.lat,
      lng: latlng.lng,
      entregado: false
    };
    
    direcciones.push(nuevaEntrega);
    guardarLocal();
    agregarMarcador(nuevaEntrega);
    mostrarDirecciones();
    
    if (posicionActual) {
      await actualizarRuta();
    }
  }
}

// Funciones optimizadas para Android
function agregarMarcador(d) {
  const marker = L.marker([d.lat, d.lng], {
    icon: L.icon({
      iconUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.7.1/dist/images/marker-icon.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41]
    })
  }).addTo(mapa).bindPopup(d.direccion);
  marcadores.push(marker);
}

async function actualizarRuta() {
  if (!posicionActual || direcciones.length < 2) return;
  
  // Algoritmo simplificado para móviles
  rutaOptimizada = [...direcciones].sort((a, b) => {
    const distA = calcularDistancia(posicionActual.lat, posicionActual.lng, a.lat, a.lng);
    const distB = calcularDistancia(posicionActual.lat, posicionActual.lng, b.lat, b.lng);
    return distA - distB;
  });
  
  mostrarRuta();
}

function mostrarRuta() {
  if (polyline) mapa.removeLayer(polyline);
  
  const puntos = [posicionActual, ...rutaOptimizada].map(p => [p.lat, p.lng]);
  polyline = L.polyline(puntos, {
    color: '#4285F4',
    weight: 4
  }).addTo(mapa);
  
  mapa.fitBounds(polyline.getBounds());
}

// GPS optimizado para Android
document.getElementById("iniciar-gps").onclick = function() {
  if (!navigator.geolocation) {
    alert("GPS no disponible en este dispositivo");
    return;
  }

  const options = {
    enableHighAccuracy: true,
    maximumAge: 10000,
    timeout: 10000
  };

  if (watchId) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    this.textContent = "Activar GPS";
    return;
  }

  this.textContent = "Buscando...";
  
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      this.textContent = "GPS Activado";
      posicionActual = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      
      if (!marcadorUsuario) {
        marcadorUsuario = L.marker([posicionActual.lat, posicionActual.lng], {
          icon: L.icon({
            iconUrl: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
            iconSize: [32, 32]
          })
        }).addTo(mapa);
      } else {
        marcadorUsuario.setLatLng([posicionActual.lat, posicionActual.lng]);
      }
      
      mapa.setView([posicionActual.lat, posicionActual.lng], 15);
      actualizarRuta();
    },
    (err) => {
      alert("Error GPS: " + err.message);
      this.textContent = "Activar GPS";
    },
    options
  );
};

// Funciones auxiliares optimizadas
function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function guardarLocal() {
  localStorage.setItem("entregas", JSON.stringify(direcciones));
}

function mostrarDirecciones() {
  const contenedor = document.getElementById("lista-direcciones");
  contenedor.innerHTML = direcciones.map((d, i) => `
    <div class="entrega-card">
      <div class="d-flex justify-content-between">
        <span>${d.direccion}</span>
        <button onclick="marcarEntregada(${i})" class="btn btn-sm btn-danger">✓</button>
      </div>
    </div>
  `).join('');
}

window.marcarEntregada = function(index) {
  direcciones.splice(index, 1);
  guardarLocal();
  mostrarDirecciones();
  actualizarRuta();
};

// Geocodificación optimizada para Android
async function obtenerDireccionDesdeCoordenadas(lat, lng) {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
    const data = await response.json();
    return data.display_name || "Ubicación en mapa";
  } catch (error) {
    console.error("Geocodificación fallida:", error);
    return "Ubicación en mapa";
  }
}

// Evento para el botón Agregar
document.getElementById("agregar").onclick = async () => {
  const input = document.getElementById("direccion");
  const direccion = input.value.trim();
  if (!direccion) return;

  const datos = await geocodificarDireccion(direccion);
  if (datos) {
    direcciones.push({...datos, entregado: false});
    guardarLocal();
    agregarMarcador(datos);
    mostrarDirecciones();
    input.value = "";
    if (posicionActual) actualizarRuta();
  } else {
    alert("No se encontró la dirección");
  }
};

async function geocodificarDireccion(direccion) {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(direccion)}&limit=1`);
    const data = await response.json();
    if (data.length > 0) {
      return {
        direccion: data[0].display_name,
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      };
    }
  } catch (error) {
    console.error("Error geocodificando:", error);
  }
  return null;
}