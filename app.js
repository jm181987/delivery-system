// Variables globales
let direcciones = JSON.parse(localStorage.getItem("entregas")) || [];
let mapa;
let marcadores = [];
let marcadorUsuario = null;
let rutaOptimizada = [];
let polyline = null;
let watchId = null;
let posicionActual = null;

// Inicialización del mapa
window.onload = () => {
  mapa = L.map('mapa').setView([0, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
  }).addTo(mapa);

  direcciones.forEach(d => agregarMarcador(d));
  mostrarDirecciones();
  actualizarEstadoGPS(false);
};

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

// Algoritmo de optimización de ruta
function optimizarRuta(posicionInicial) {
  if (direcciones.length === 0) return [];

  const pedidosRestantes = [...direcciones];
  const ruta = [];
  let puntoActual = posicionInicial;

  while (pedidosRestantes.length > 0) {
    let indiceMasCercano = 0;
    let distanciaMasCorta = calcularDistancia(
      puntoActual.lat, puntoActual.lng,
      pedidosRestantes[0].lat, pedidosRestantes[0].lng
    );

    for (let i = 1; i < pedidosRestantes.length; i++) {
      const distancia = calcularDistancia(
        puntoActual.lat, puntoActual.lng,
        pedidosRestantes[i].lat, pedidosRestantes[i].lng
      );
      if (distancia < distanciaMasCorta) {
        distanciaMasCorta = distancia;
        indiceMasCercano = i;
      }
    }

    ruta.push(pedidosRestantes[indiceMasCercano]);
    puntoActual = pedidosRestantes[indiceMasCercano];
    pedidosRestantes.splice(indiceMasCercano, 1);
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

      // Añadir marcador de inicio (posición actual)
      L.marker([posicionActual.lat, posicionActual.lng], {
        icon: L.divIcon({
          className: 'punto-inicio',
          html: 'Tú',
          iconSize: [20, 20]
        })
      }).addTo(mapa).bindPopup("Tu posición actual");

      // Ajustar vista del mapa para mostrar toda la ruta
      mapa.fitBounds(polyline.getBounds());
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
  }
}

// Actualizar información de la ruta
function mostrarInformacionRuta(distanciaMetros, duracionSegundos) {
  const distanciaKm = (distanciaMetros / 1000).toFixed(1);
  const duracionMinutos = Math.ceil(duracionSegundos / 60);
  
  document.getElementById('info-ruta').innerHTML = `
    <div>Distancia total: <strong>${distanciaKm} km</strong></div>
    <div>Tiempo estimado: <strong>${duracionMinutos} minutos</strong></div>
    <div>Paradas restantes: <strong>${direcciones.length}</strong></div>
  `;
}

// Función principal para actualizar la ruta en tiempo real
async function actualizarRutaEnTiempoReal() {
  if (!posicionActual || direcciones.length === 0) return;
  
  // 1. Optimizar el orden de las entregas
  rutaOptimizada = optimizarRuta(posicionActual);
  direcciones = [...rutaOptimizada];
  guardarLocal();
  mostrarDirecciones();
  
  // 2. Calcular y mostrar la ruta real
  await mostrarRutaRealOptimizada(rutaOptimizada);
}

// Iniciar/Detener seguimiento GPS
document.getElementById("iniciar-gps").onclick = function() {
  if (watchId) {
    // Detener seguimiento
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    posicionActual = null;
    actualizarEstadoGPS(false);
    this.textContent = "Activar GPS en Vivo";
    this.classList.remove("btn-danger");
    this.classList.add("btn-success");
    document.getElementById('optimizar-ruta').disabled = true;
  } else {
    // Iniciar seguimiento
    if (!navigator.geolocation) {
      alert("Geolocalización no disponible");
      return;
    }

    actualizarEstadoGPS(true);
    this.textContent = "Detener GPS";
    this.classList.remove("btn-success");
    this.classList.add("btn-danger");
    document.getElementById('optimizar-ruta').disabled = false;

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

        // Actualizar ruta si hay direcciones
        if (direcciones.length > 0) {
          actualizarRutaEnTiempoReal();
        }

        // Verificar proximidad a puntos de entrega
        verificarProximidadEntregas(posicionActual);
      },
      (err) => {
        console.error("Error en GPS:", err);
        alert("Error al obtener ubicación GPS");
      },
      { 
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000
      }
    );
  }
};

// Verificar proximidad a puntos de entrega
function verificarProximidadEntregas(posicion) {
  const audio = new Audio("sonido.mp3");
  
  direcciones.forEach((d, i) => {
    if (d.entregado) return;
    
    const dist = calcularDistancia(posicion.lat, posicion.lng, d.lat, d.lng);
    if (dist < 100 && !d.alertado) {
      audio.play().catch(() => {});
      d.alertado = true;
      guardarLocal();
      
      const confirmar = confirm(`¡Llegaste a: ${d.direccion}!\n¿Marcar como entregada?`);
      if (confirmar) {
        marcarEntregada(i);
      }
    }
  });
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
  
  await actualizarRutaEnTiempoReal();
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
        'Todas las entregas completadas!' : 
        'Activa el GPS para calcular la ruta';
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
    card.innerHTML = `
      <strong>${d.direccion}</strong><br>
      <span class="text-muted">Orden: ${i+1}</span><br>
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
  }
}