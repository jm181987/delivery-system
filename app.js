// Variables globales
let direcciones = JSON.parse(localStorage.getItem("entregas")) || [];
let mapa;
let marcadores = [];
let marcadorUsuario = null;
let rutaOptimizada = [];
let polyline = null;
let watchId = null;
let posicionActual = null;
let intervaloActualizacion = null;
let entregaActivaIndex = null;

// Variables para selección en mapa
let clickTimer = null;
let tooltip = null;
let previewMarker = null;
const LONG_CLICK_DURATION = 800; // 0.8 segundos

// Inicialización del mapa
window.onload = async () => {
  document.getElementById('loading-overlay').style.display = 'flex';
  
  try {
    mapa = L.map('mapa').setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(mapa);

    // Configurar eventos del mapa para clic prolongado
    configurarEventosMapa();

    direcciones.forEach(d => agregarMarcador(d));
    mostrarDirecciones();
    actualizarEstadoGPS(false);
  } catch (error) {
    console.error("Error al cargar el mapa:", error);
    alert("Error al inicializar el mapa. Por favor recarga la página.");
  } finally {
    document.getElementById('loading-overlay').style.display = 'none';
  }
};

function configurarEventosMapa() {
  // Crear tooltip para instrucciones
  tooltip = document.createElement('div');
  tooltip.className = 'map-tooltip';
  document.body.appendChild(tooltip);

  // Eventos para clic prolongado
  mapa.on('mousedown', iniciarClickLargo);
  mapa.on('mouseup', cancelarClickLargo);
  mapa.on('mouseout', cancelarClickLargo);
  mapa.on('mousemove', moverMouseEnMapa);
  
  // Evento para clic simple (solo para limpiar selección)
  mapa.on('click', () => {
    if (previewMarker) {
      mapa.removeLayer(previewMarker);
      previewMarker = null;
      tooltip.style.display = 'none';
    }
  });
}

// Función para calcular distancia (Haversine)
function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const rad = x => x * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(rad(lat1)) * Math.cos(rad(lat2)) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Algoritmo de optimización de ruta dinámica
function optimizarRutaDinamica(posicionInicial) {
  if (direcciones.length === 0) return [];

  // Si hay una entrega activa, la mantenemos como primera
  if (entregaActivaIndex !== null && entregaActivaIndex < direcciones.length) {
    const entregaActiva = direcciones[entregaActivaIndex];
    const pedidosRestantes = direcciones.filter((_, i) => i !== entregaActivaIndex);
    
    // Optimizar solo las entregas restantes
    const rutaRestante = optimizarRutaBasica(posicionInicial, pedidosRestantes);
    return [entregaActiva, ...rutaRestante];
  }
  
  return optimizarRutaBasica(posicionInicial, direcciones);
}

// Algoritmo básico del vecino más cercano
function optimizarRutaBasica(posicionInicial, puntos) {
  if (puntos.length === 0) return [];

  const puntosRestantes = [...puntos];
  const ruta = [];
  let puntoActual = posicionInicial;

  while (puntosRestantes.length > 0) {
    let indiceMasCercano = 0;
    let distanciaMasCorta = calcularDistancia(
      puntoActual.lat, puntoActual.lng,
      puntosRestantes[0].lat, puntosRestantes[0].lng
    );

    for (let i = 1; i < puntosRestantes.length; i++) {
      const distancia = calcularDistancia(
        puntoActual.lat, puntoActual.lng,
        puntosRestantes[i].lat, puntosRestantes[i].lng
      );
      if (distancia < distanciaMasCorta) {
        distanciaMasCorta = distancia;
        indiceMasCercano = i;
      }
    }

    ruta.push(puntosRestantes[indiceMasCercano]);
    puntoActual = puntosRestantes[indiceMasCercano];
    puntosRestantes.splice(indiceMasCercano, 1);
  }

  return ruta;
}

// Mostrar ruta real usando OSRM
async function mostrarRutaRealOptimizada(ruta) {
  // Limpiar ruta anterior
  if (polyline) {
    mapa.removeLayer(polyline);
    polyline = null;
  }

  if (ruta.length < 1 || !posicionActual) return;

  try {
    const perfil = 'driving';
    let url = `https://router.project-osrm.org/route/v1/${perfil}/`;
    
    // Siempre comenzar desde la posición actual
    url += `${posicionActual.lng},${posicionActual.lat}`;
    
    // Agregar todos los puntos de entrega
    for (const punto of ruta) {
      url += `;${punto.lng},${punto.lat}`;
    }
    
    url += '?overview=full&geometries=geojson&steps=true';

    const response = await fetch(url);
    const data = await response.json();

    if (data.routes && data.routes.length > 0) {
      const rutaData = data.routes[0];
      
      // Mostrar información de la ruta
      mostrarInformacionRuta(rutaData.distance, rutaData.duration);
      
      // Dibujar la ruta en el mapa
      polyline = L.geoJSON(rutaData.geometry, {
        style: {
          color: '#3498db',
          weight: 5,
          opacity: 0.7,
          lineJoin: 'round'
        }
      }).addTo(mapa);

      // Ajustar vista del mapa para mostrar toda la ruta
      mapa.fitBounds(polyline.getBounds());
      
      // Mostrar próxima entrega
      if (ruta.length > 0) {
        document.getElementById('proxima-entrega').innerHTML = `
          <strong>Próxima entrega:</strong> ${ruta[0].direccion}
        `;
      }
    }
  } catch (error) {
    console.error("Error al obtener ruta:", error);
    // Fallback: mostrar línea recta
    const coordenadas = [[posicionActual.lat, posicionActual.lng], ...ruta.map(p => [p.lat, p.lng])];
    polyline = L.polyline(coordenadas, {
      color: '#3498db',
      weight: 3,
      opacity: 0.7,
      dashArray: '5, 5'
    }).addTo(mapa);
    
    document.getElementById('info-ruta').innerHTML = `
      <div>Modo simplificado (sin direcciones de calles)</div>
      <div>Paradas: ${ruta.length}</div>
    `;
    
    if (ruta.length > 0) {
      document.getElementById('proxima-entrega').innerHTML = `
        <strong>Próxima entrega:</strong> ${ruta[0].direccion}
      `;
    }
  }
}

// Función principal para actualizar la ruta en tiempo real
async function actualizarRutaEnTiempoReal() {
  if (!posicionActual || direcciones.length === 0) return;
  
  // 1. Optimizar el orden de las entregas
  rutaOptimizada = optimizarRutaDinamica(posicionActual);
  direcciones = [...rutaOptimizada];
  guardarLocal();
  mostrarDirecciones();
  
  // 2. Calcular y mostrar la ruta real
  await mostrarRutaRealOptimizada(rutaOptimizada);
}

// Iniciar/Detener seguimiento GPS
document.getElementById("iniciar-gps").onclick = function() {
  if (watchId) {
    detenerSeguimientoGPS();
    this.textContent = "Activar GPS en Vivo";
    this.classList.remove("btn-danger");
    this.classList.add("btn-success");
  } else {
    iniciarSeguimientoGPS();
    this.textContent = "Detener GPS";
    this.classList.remove("btn-success");
    this.classList.add("btn-danger");
  }
};

function detenerSeguimientoGPS() {
  navigator.geolocation.clearWatch(watchId);
  clearInterval(intervaloActualizacion);
  watchId = null;
  intervaloActualizacion = null;
  posicionActual = null;
  actualizarEstadoGPS(false);
  document.getElementById('optimizar-ruta').disabled = true;
  document.getElementById('proxima-entrega').innerHTML = '';
}

function iniciarSeguimientoGPS() {
  if (!navigator.geolocation) {
    alert("Geolocalización no disponible");
    return;
  }

  actualizarEstadoGPS(true);
  document.getElementById('optimizar-ruta').disabled = false;

  // Actualización más frecuente para mejor precisión
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      posicionActual = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };

      // Actualizar marcador de usuario
      if (!marcadorUsuario) {
        marcadorUsuario = L.marker([posicionActual.lat, posicionActual.lng], {
          icon: L.icon({
            iconUrl: "https://cdn-icons-png.flaticon.com/512/61/61168.png",
            iconSize: [32, 32],
            iconAnchor: [16, 32]
          })
        }).addTo(mapa).bindPopup("Tú estás aquí").openPopup();
      } else {
        marcadorUsuario.setLatLng([posicionActual.lat, posicionActual.lng]);
      }

      // Centrar mapa en la posición actual
      mapa.setView([posicionActual.lat, posicionActual.lng], 15);
    },
    (err) => {
      console.error("Error en GPS:", err);
      alert("Error al obtener ubicación GPS");
    },
    { 
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 5000
    }
  );

  // Iniciar intervalo para actualización dinámica de ruta
  intervaloActualizacion = setInterval(() => {
    if (posicionActual && direcciones.length > 0) {
      actualizarRutaEnTiempoReal();
      verificarProximidadEntregas(posicionActual);
    }
  }, 10000); // Actualizar cada 10 segundos

  // Primera actualización inmediata
  if (posicionActual && direcciones.length > 0) {
    actualizarRutaEnTiempoReal();
  }
}

// Funciones para selección en mapa (clic prolongado)
function iniciarClickLargo(e) {
  if (clickTimer !== null || e.originalEvent.button !== 0) return;
  
  clickTimer = setTimeout(() => {
    clickTimer = null;
    confirmarAgregarPunto(e.latlng);
  }, LONG_CLICK_DURATION);
  
  // Mostrar marcador de vista previa
  if (previewMarker) {
    mapa.removeLayer(previewMarker);
  }
  previewMarker = L.circleMarker(e.latlng, {
    radius: 8,
    className: 'map-marker-preview'
  }).addTo(mapa);
  
  // Mostrar tooltip
  tooltip.style.display = 'block';
  tooltip.textContent = 'Suelta para agregar esta ubicación';
  actualizarPosicionTooltip(e.originalEvent);
}

function cancelarClickLargo() {
  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = null;
  }
  tooltip.style.display = 'none';
  if (previewMarker) {
    mapa.removeLayer(previewMarker);
    previewMarker = null;
  }
}

function moverMouseEnMapa(e) {
  if (clickTimer !== null) {
    actualizarPosicionTooltip(e.originalEvent);
    if (previewMarker) {
      previewMarker.setLatLng(e.latlng);
    }
  }
}

function actualizarPosicionTooltip(event) {
  tooltip.style.left = (event.clientX + 15) + 'px';
  tooltip.style.top = (event.clientY + 15) + 'px';
}

async function confirmarAgregarPunto(latlng) {
  tooltip.style.display = 'none';
  if (previewMarker) {
    mapa.removeLayer(previewMarker);
    previewMarker = null;
  }

  // Obtener la dirección usando geocodificación inversa
  const direccion = await obtenerDireccionDesdeCoordenadas(latlng.lat, latlng.lng);
  
  if (direccion) {
    const confirmar = confirm(`¿Agregar esta ubicación como entrega?\n\n${direccion}`);
    if (confirmar) {
      const nuevaEntrega = {
        direccion: direccion,
        lat: latlng.lat,
        lng: latlng.lng,
        entregado: false,
        alertado: false
      };
      
      direcciones.push(nuevaEntrega);
      guardarLocal();
      agregarMarcador(nuevaEntrega);
      mostrarDirecciones();
      
      // Si el GPS está activo, recalcular ruta
      if (posicionActual) {
        await actualizarRutaEnTiempoReal();
      }
    }
  }
}

// Función para geocodificación inversa (coordenadas -> dirección)
async function obtenerDireccionDesdeCoordenadas(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    
    if (data.address) {
      // Construir una dirección legible
      const address = data.address;
      let direccion = '';
      
      if (address.road) direccion += address.road;
      if (address.house_number) direccion += ` ${address.house_number}, `;
      if (address.neighbourhood) direccion += address.neighbourhood;
      else if (address.city) direccion += address.city;
      else if (address.town) direccion += address.town;
      else if (address.village) direccion += address.village;
      else if (address.county) direccion += address.county;
      
      return direccion || "Ubicación en el mapa";
    }
  } catch (error) {
    console.error("Error en geocodificación inversa:", error);
  }
  return "Ubicación en el mapa";
}

// [Resto de funciones auxiliares... (mostrarDirecciones, agregarMarcador, guardarLocal, etc.)]
// Verificar proximidad a puntos de entrega
function verificarProximidadEntregas(posicion) {
  const audio = new Audio("sonido.mp3");
  
  // Solo verificar si hay una ruta optimizada
  if (rutaOptimizada.length === 0) return;
  
  // Comprobar la entrega más cercana (primera en la ruta optimizada)
  const entrega = rutaOptimizada[0];
  const dist = calcularDistancia(posicion.lat, posicion.lng, entrega.lat, entrega.lng);
  
  if (dist < 150 && !entrega.alertado) { // Radio de 150 metros
    // Marcar como entrega activa
    entregaActivaIndex = direcciones.findIndex(d => 
      d.lat === entrega.lat && d.lng === entrega.lng
    );
    
    // Notificar al usuario
    audio.play().catch(() => {});
    entrega.alertado = true;
    guardarLocal();
    mostrarDirecciones();
    
    const confirmar = confirm(`¡Estás cerca de: ${entrega.direccion}!\n¿Quieres marcarla como entrega activa?`);
    if (confirmar) {
      // Recalcular ruta manteniendo esta entrega como prioritaria
      actualizarRutaEnTiempoReal();
    } else {
      entregaActivaIndex = null;
    }
  } else if (dist > 200 && entregaActivaIndex !== null) {
    // Si nos alejamos lo suficiente, quitar prioridad
    entregaActivaIndex = null;
    actualizarRutaEnTiempoReal();
  }
}

// Optimización manual de ruta
document.getElementById("optimizar-ruta").onclick = async () => {
  if (direcciones.length < 2) {
    alert("Necesitas al menos 2 direcciones para optimizar");
    return;
  }
  
  if (!posicionActual) {
    alert("Activa el GPS primero para obtener tu posición actual");
    return;
  }
  
  // Quitar cualquier prioridad de entrega activa
  entregaActivaIndex = null;
  await actualizarRutaEnTiempoReal();
  alert("Ruta reoptimizada desde tu posición actual");
};

// Agregar nueva dirección
document.getElementById("agregar").onclick = async () => {
  const input = document.getElementById("direccion");
  const direccion = input.value.trim();
  if (!direccion) return;

  const datos = await geocodificar(direccion);
  if (datos) {
    datos.entregado = false;
    datos.alertado = false;
    direcciones.push(datos);
    guardarLocal();
    agregarMarcador(datos);
    mostrarDirecciones();
    input.value = "";
    
    // Si el GPS está activo, recalcular ruta
    if (posicionActual) {
      await actualizarRutaEnTiempoReal();
    }
  } else {
    alert("No se pudo geocodificar la dirección");
  }
};

// Marcar entrega como completada
function marcarEntregada(index) {
  if (confirm(`¿Marcar "${direcciones[index].direccion}" como entregada?`)) {
    // Si era la entrega activa, limpiar el estado
    if (entregaActivaIndex === index) {
      entregaActivaIndex = null;
    }
    
    mapa.removeLayer(marcadores[index]);
    direcciones.splice(index, 1);
    marcadores.splice(index, 1);
    guardarLocal();
    mostrarDirecciones();
    
    if (direcciones.length > 0 && posicionActual) {
      actualizarRutaEnTiempoReal();
    } else if (polyline) {
      mapa.removeLayer(polyline);
      polyline = null;
      document.getElementById('info-ruta').innerHTML = 
        direcciones.length === 0 ? 
        '¡Todas las entregas completadas!' : 
        'Activa el GPS para calcular la ruta';
      document.getElementById('proxima-entrega').innerHTML = '';
    }
  }
}

// Funciones auxiliares
function mostrarDirecciones() {
  const contenedor = document.getElementById("lista-direcciones");
  contenedor.innerHTML = "";
  direcciones.forEach((d, i) => {
    const card = document.createElement("div");
    card.className = "entrega-card";
    if (i === 0 && rutaOptimizada.length > 0 && d.lat === rutaOptimizada[0].lat && d.lng === rutaOptimizada[0].lng) {
      card.classList.add("proxima-entrega");
    }
    if (i === entregaActivaIndex) {
      card.classList.add("activa");
    }
    card.innerHTML = `
      <strong>${d.direccion}</strong><br>
      <span class="text-muted">Orden actual: ${i+1}</span><br>
      <button class="btn btn-danger btn-sm mt-2" onclick="marcarEntregada(${i})">Marcar como Entregada</button>
    `;
    contenedor.appendChild(card);
  });
}

function agregarMarcador(d) {
  let marker = L.marker([d.lat, d.lng], {
    icon: L.icon({
      iconUrl: "https://cdn-icons-png.flaticon.com/512/447/447031.png",
      iconSize: [25, 25]
    })
  }).addTo(mapa).bindPopup(d.direccion);
  marcadores.push(marker);
}

function guardarLocal() {
  localStorage.setItem("entregas", JSON.stringify(direcciones));
}

async function geocodificar(direccion) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(direccion)}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.length > 0) {
      return {
        direccion,
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        entregado: false,
        alertado: false
      };
    }
  } catch (error) {
    console.error("Error al geocodificar:", error);
  }
  return null;
}

function actualizarEstadoGPS(activo) {
  const estado = document.getElementById('estado-gps');
  estado.textContent = activo ? 'Activo' : 'Inactivo';
  estado.className = activo ? 'estado-gps gps-activo' : 'estado-gps gps-inactivo';
  
  if (!activo) {
    document.getElementById('info-ruta').innerHTML = 'Activa el GPS para comenzar';
    document.getElementById('proxima-entrega').innerHTML = '';
  }
}

// Mostrar información de la ruta
function mostrarInformacionRuta(distanciaMetros, duracionSegundos) {
  const distanciaKm = (distanciaMetros / 1000).toFixed(1);
  const duracionMinutos = Math.ceil(duracionSegundos / 60);
  
  document.getElementById('info-ruta').innerHTML = `
    <div>Distancia total: <strong>${distanciaKm} km</strong></div>
    <div>Tiempo estimado: <strong>${duracionMinutos} minutos</strong></div>
    <div>Paradas restantes: <strong>${direcciones.length}</strong></div>
  `;
}