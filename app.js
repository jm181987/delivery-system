let direcciones = JSON.parse(localStorage.getItem("entregas")) || [];
let mapa;
let marcadores = [];
let marcadorUsuario = null;
let rutaOptimizada = [];
let polyline = null;
let controlRuta = null;

window.onload = () => {
  mapa = L.map('mapa').setView([0, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
  }).addTo(mapa);

  direcciones.forEach(d => agregarMarcador(d));
  mostrarDirecciones();
};

// Función para optimizar el orden de entregas
function optimizarRuta(posicionActual) {
  if (direcciones.length === 0) return [];

  const pedidosRestantes = [...direcciones];
  const ruta = [];
  let puntoActual = posicionActual;

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

// Función para mostrar ruta real con OSRM
async function mostrarRutaRealOptimizada(ruta) {
  // Limpiar ruta anterior
  if (polyline) {
    mapa.removeLayer(polyline);
    polyline = null;
  }
  if (controlRuta) {
    mapa.removeControl(controlRuta);
    controlRuta = null;
  }

  if (ruta.length < 1) return;

  // Obtener coordenadas
  let coordenadas = ruta.map(punto => [punto.lat, punto.lng]);
  let inicio = null;

  // Agregar ubicación del usuario si está disponible
  if (marcadorUsuario) {
    const userLatLng = marcadorUsuario.getLatLng();
    inicio = { lat: userLatLng.lat, lng: userLatLng.lng };
    coordenadas.unshift([inicio.lat, inicio.lng]);
  } else {
    inicio = { lat: coordenadas[0][0], lng: coordenadas[0][1] };
  }

  try {
    const perfil = 'driving'; // 'walking', 'cycling'
    let url = `https://router.project-osrm.org/route/v1/${perfil}/`;
    
    // Construir URL con todas las coordenadas
    url += `${inicio.lng},${inicio.lat}`;
    for (let i = 1; i < coordenadas.length; i++) {
      url += `;${coordenadas[i][1]},${coordenadas[i][0]}`;
    }
    url += '?overview=full&geometries=geojson&steps=true';

    const response = await fetch(url);
    const data = await response.json();

    if (data.routes && data.routes.length > 0) {
      const rutaData = data.routes[0];
      
      // Mostrar información de la ruta
      mostrarInformacionRuta(rutaData.distance, rutaData.duration);
      
      // Dibujar la ruta en el mapa
      polyline = L.geoJSON(data.routes[0].geometry, {
        style: {
          color: '#3498db',
          weight: 5,
          opacity: 0.7,
          lineJoin: 'round'
        }
      }).addTo(mapa);

      // Añadir marcadores especiales
      if (marcadorUsuario) {
        L.marker([inicio.lat, inicio.lng], {
          icon: L.divIcon({
            className: 'punto-inicio',
            html: 'Inicio',
            iconSize: [20, 20]
          })
        }).addTo(mapa).bindPopup("Punto de inicio");
      }

      // Ajustar vista del mapa
      mapa.fitBounds(polyline.getBounds());
    }
  } catch (error) {
    console.error("Error al obtener ruta:", error);
    // Fallback a línea recta si la API falla
    polyline = L.polyline(coordenadas, {
      color: '#3498db',
      weight: 3,
      opacity: 0.7,
      dashArray: '5, 5'
    }).addTo(mapa);
    document.getElementById('info-ruta').innerHTML = 
      'No se pudo calcular la ruta exacta. Mostrando línea recta entre puntos.';
  }
}

function mostrarInformacionRuta(distanciaMetros, duracionSegundos) {
  const distanciaKm = (distanciaMetros / 1000).toFixed(1);
  const duracionMinutos = Math.ceil(duracionSegundos / 60);
  
  document.getElementById('info-ruta').innerHTML = `
    <div>Distancia total: <strong>${distanciaKm} km</strong></div>
    <div>Tiempo estimado: <strong>${duracionMinutos} minutos</strong></div>
    <div>Número de paradas: <strong>${direcciones.length}</strong></div>
  `;
}

// Eventos principales
document.getElementById("optimizar-ruta").onclick = async () => {
  if (direcciones.length < 2) {
    alert("Necesitas al menos 2 direcciones para optimizar");
    return;
  }
  
  let puntoInicio;
  if (marcadorUsuario) {
    const latLng = marcadorUsuario.getLatLng();
    puntoInicio = { lat: latLng.lat, lng: latLng.lng };
  } else {
    const centro = mapa.getCenter();
    puntoInicio = { lat: centro.lat, lng: centro.lng };
  }
  
  rutaOptimizada = optimizarRuta(puntoInicio);
  direcciones = [...rutaOptimizada];
  guardarLocal();
  mostrarDirecciones();
  await mostrarRutaRealOptimizada(rutaOptimizada);
};

document.getElementById("iniciar-gps").onclick = async () => {
  if (!navigator.geolocation) {
    alert("Geolocalización no disponible");
    return;
  }

  navigator.geolocation.getCurrentPosition(async (pos) => {
    const { latitude, longitude } = pos.coords;
    const posicionActual = { lat: latitude, lng: longitude };
    
    rutaOptimizada = optimizarRuta(posicionActual);
    direcciones = [...rutaOptimizada];
    guardarLocal();
    mostrarDirecciones();
    await mostrarRutaRealOptimizada(rutaOptimizada);
    
    iniciarSeguimientoGPS(posicionActual);
  }, console.error, { enableHighAccuracy: true });
};

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
  } else {
    alert("No se pudo geocodificar.");
  }
};

// Funciones auxiliares
function iniciarSeguimientoGPS(posicionInicial) {
  const audio = new Audio("sonido.mp3");
  
  marcadorUsuario = L.marker([posicionInicial.lat, posicionInicial.lng], {
    icon: L.icon({
      iconUrl: "https://cdn-icons-png.flaticon.com/512/61/61168.png",
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    })
  }).addTo(mapa).bindPopup("Tú estás aquí").openPopup();

  navigator.geolocation.watchPosition((pos) => {
    const { latitude, longitude } = pos.coords;
    marcadorUsuario.setLatLng([latitude, longitude]);

    rutaOptimizada.forEach((d, i) => {
      if (d.entregado) return;
      
      const dist = calcularDistancia(latitude, longitude, d.lat, d.lng);
      if (dist < 100 && !d.alertado) {
        audio.play().catch(() => {});
        const confirmar = confirm(`Estás cerca de: ${d.direccion}.\n¿Se entregó el paquete?`);
        d.alertado = true;
        if (confirmar) {
          alert(`Marca "${d.direccion}" como entregada usando el botón.`);
        }
      }
    });

    guardarLocal();
    mostrarDirecciones();
  }, console.error, { enableHighAccuracy: true });
}

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

function marcarEntregada(index) {
  if (confirm(`¿Marcar "${direcciones[index].direccion}" como entregada?`)) {
    mapa.removeLayer(marcadores[index]);
    direcciones.splice(index, 1);
    marcadores.splice(index, 1);
    guardarLocal();
    mostrarDirecciones();
    
    if (direcciones.length > 1) {
      let puntoInicio;
      if (marcadorUsuario) {
        const latLng = marcadorUsuario.getLatLng();
        puntoInicio = { lat: latLng.lat, lng: latLng.lng };
      } else {
        const centro = mapa.getCenter();
        puntoInicio = { lat: centro.lat, lng: centro.lng };
      }
      
      rutaOptimizada = optimizarRuta(puntoInicio);
      mostrarRutaRealOptimizada(rutaOptimizada);
    } else if (polyline) {
      mapa.removeLayer(polyline);
      polyline = null;
      document.getElementById('info-ruta').innerHTML = 'Agrega más direcciones para calcular una ruta';
    }
  }
}

function guardarLocal() {
  localStorage.setItem("entregas", JSON.stringify(direcciones));
}

function agregarMarcador(d) {
  let marker = L.marker([d.lat, d.lng], {
    icon: L.icon({
      iconUrl: "https://cdn-icons-png.flaticon.com/512/447/447031.png",
      iconSize: [25, 25]
    })
  }).addTo(mapa).bindPopup(d.direccion);
  marcadores.push(marker);
  mapa.setView([d.lat, d.lng], 14);
}

async function geocodificar(direccion) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(direccion)}`;
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
  return null;
}

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