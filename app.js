// Variables globales
let direcciones = JSON.parse(localStorage.getItem("entregas")) || [];
let mapa, marcadores = [], marcadorUsuario = null;
let rutaOptimizada = [], polyline = null;
let watchId = null, posicionActual = null;
let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Elementos UI
const elementos = {
    mapa: null,
    inputDireccion: document.getElementById('direccion'),
    btnAgregar: document.getElementById('agregar'),
    btnGPS: document.getElementById('iniciar-gps'),
    btnOptimizar: document.getElementById('optimizar-ruta'),
    listaDirecciones: document.getElementById('lista-direcciones'),
    tooltip: Object.assign(document.createElement('div'), { className: 'map-tooltip' })
};

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
    try {
        initMapa();
        initEventos();
        cargarEntregas();
        document.body.appendChild(elementos.tooltip);
    } catch (error) {
        alert("Error al iniciar: " + error.message);
    }
});

function initMapa() {
    // Configuración especial para móviles
    mapa = L.map('mapa', {
        tap: !isMobile,
        touchZoom: true,
        scrollWheelZoom: !isMobile,
        doubleClickZoom: !isMobile,
        boxZoom: !isMobile,
        dragging: true,
        attributionControl: false
    }).setView([0, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        detectRetina: true
    }).addTo(mapa);
}

function initEventos() {
    // Eventos táctiles y de ratón unificados
    const eventTypes = isMobile ? 
        ['touchstart', 'touchend', 'touchmove'] : 
        ['mousedown', 'mouseup', 'mousemove', 'mouseout'];
    
    eventTypes.forEach(type => {
        mapa.on(type, handleMapEvent);
    });

    // Eventos de botones
    elementos.btnAgregar.addEventListener('click', agregarDireccion);
    elementos.btnGPS.addEventListener('click', toggleGPS);
    elementos.btnOptimizar.addEventListener('click', optimizarManual);
}

// Manejador de eventos unificado
let longPressTimer;
let touchMoved = false;

function handleMapEvent(e) {
    switch(e.type) {
        case 'touchstart':
        case 'mousedown':
            if (e.originalEvent.touches?.length > 1) return;
            touchMoved = false;
            longPressTimer = setTimeout(() => {
                if (!touchMoved) mostrarPrevisualizacion(getEventLatLng(e));
            }, 600);
            break;
            
        case 'touchmove':
        case 'mousemove':
            touchMoved = true;
            clearTimeout(longPressTimer);
            if (previewMarker) {
                previewMarker.setLatLng(getEventLatLng(e));
                updateTooltipPosition(e);
            }
            break;
            
        case 'touchend':
        case 'mouseup':
        case 'mouseout':
            clearTimeout(longPressTimer);
            if (previewMarker && !touchMoved) {
                confirmarAgregarPunto(previewMarker.getLatLng());
            }
            limpiarPrevisualizacion();
            break;
    }
}

function getEventLatLng(e) {
    return isMobile ? 
        mapa.containerPointToLatLng(L.point(
            e.originalEvent.touches[0].clientX, 
            e.originalEvent.touches[0].clientY
        )) : 
        e.latlng;
}

function updateTooltipPosition(e) {
    if (!elementos.tooltip.style.display) return;
    
    const pos = isMobile ? {
        x: e.originalEvent.touches[0].clientX,
        y: e.originalEvent.touches[0].clientY
    } : {
        x: e.originalEvent.clientX,
        y: e.originalEvent.clientY
    };
    
    elementos.tooltip.style.left = `${pos.x + 20}px`;
    elementos.tooltip.style.top = `${pos.y - 40}px`;
}

// Previsualización de marcador
let previewMarker;

function mostrarPrevisualizacion(latlng) {
    limpiarPrevisualizacion();
    
    previewMarker = L.marker(latlng, {
        icon: L.divIcon({
            className: 'preview-marker',
            iconSize: [30, 30]
        }),
        interactive: false
    }).addTo(mapa);

    elementos.tooltip.textContent = 'Suelta para agregar';
    elementos.tooltip.style.display = 'block';
    updateTooltipPosition({ originalEvent: { touches: [{ clientX: 0, clientY: 0 }] });
}

function limpiarPrevisualizacion() {
    if (previewMarker) {
        mapa.removeLayer(previewMarker);
        previewMarker = null;
    }
    elementos.tooltip.style.display = 'none';
}

// Funciones principales
async function confirmarAgregarPunto(latlng) {
    const direccion = await obtenerDireccionDesdeCoordenadas(latlng.lat, latlng.lng);
    
    if (direccion) {
        const confirmar = confirm(`¿Agregar esta ubicación?\n\n${direccion}`);
        if (confirmar) {
            agregarEntrega({
                direccion,
                lat: latlng.lat,
                lng: latlng.lng,
                entregado: false
            });
        }
    }
}

function agregarEntrega(entrega) {
    direcciones.push(entrega);
    guardarLocal();
    agregarMarcador(entrega);
    mostrarDirecciones();
    
    if (posicionActual) {
        actualizarRuta();
    }
}

async function agregarDireccion() {
    const direccion = elementos.inputDireccion.value.trim();
    if (!direccion) return;

    const datos = await geocodificarDireccion(direccion);
    if (datos) {
        agregarEntrega({...datos, entregado: false});
        elementos.inputDireccion.value = "";
    } else {
        alert("No se encontró la dirección");
    }
}

// Gestión del GPS
function toggleGPS() {
    if (watchId) {
        detenerGPS();
        elementos.btnGPS.textContent = "Activar GPS";
        elementos.btnGPS.classList.remove("btn-danger");
        elementos.btnGPS.classList.add("btn-success");
    } else {
        iniciarGPS();
        elementos.btnGPS.textContent = "Detener GPS";
        elementos.btnGPS.classList.remove("btn-success");
        elementos.btnGPS.classList.add("btn-danger");
    }
}

function iniciarGPS() {
    if (!navigator.geolocation) {
        alert("GPS no disponible");
        return;
    }

    elementos.btnGPS.textContent = "Buscando...";
    
    watchId = navigator.geolocation.watchPosition(
        (pos) => {
            posicionActual = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude
            };
            
            actualizarPosicionUsuario();
            actualizarRuta();
            elementos.btnGPS.textContent = "GPS Activado";
            elementos.btnOptimizar.disabled = false;
        },
        (err) => {
            alert("Error GPS: " + err.message);
            elementos.btnGPS.textContent = "Activar GPS";
        },
        { 
            enableHighAccuracy: true,
            maximumAge: 10000,
            timeout: 15000 
        }
    );
}

function detenerGPS() {
    if (watchId) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    posicionActual = null;
    elementos.btnOptimizar.disabled = true;
}

function actualizarPosicionUsuario() {
    if (!posicionActual) return;
    
    if (!marcadorUsuario) {
        marcadorUsuario = L.marker([posicionActual.lat, posicionActual.lng], {
            icon: L.icon({
                iconUrl: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
                iconSize: [32, 32]
            })
        }).addTo(mapa).bindPopup("Tu ubicación");
    } else {
        marcadorUsuario.setLatLng([posicionActual.lat, posicionActual.lng]);
    }
    
    mapa.setView([posicionActual.lat, posicionActual.lng], 15);
}

// Optimización de rutas
function optimizarManual() {
    if (!posicionActual || direcciones.length < 2) {
        alert("Necesitas al menos 2 entregas y GPS activo");
        return;
    }
    actualizarRuta();
}

function actualizarRuta() {
    if (!posicionActual || direcciones.length === 0) return;
    
    // Algoritmo optimizado para móviles
    rutaOptimizada = [...direcciones]
        .map(entrega => ({
            ...entrega,
            distancia: calcularDistancia(
                posicionActual.lat, posicionActual.lng,
                entrega.lat, entrega.lng
            )
        }))
        .sort((a, b) => a.distancia - b.distancia)
        .map(({ distancia, ...rest }) => rest);
    
    mostrarRuta();
}

function mostrarRuta() {
    if (polyline) mapa.removeLayer(polyline);
    
    if (rutaOptimizada.length === 0) return;
    
    const puntos = [posicionActual, ...rutaOptimizada].map(p => [p.lat, p.lng]);
    polyline = L.polyline(puntos, {
        color: '#4285F4',
        weight: 4,
        opacity: 0.7,
        lineJoin: 'round'
    }).addTo(mapa);
    
    mapa.fitBounds(polyline.getBounds());
    mostrarDirecciones();
}

// Funciones de utilidad
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

function cargarEntregas() {
    direcciones.forEach(agregarMarcador);
    mostrarDirecciones();
}

function agregarMarcador(entrega) {
    const marker = L.marker([entrega.lat, entrega.lng], {
        icon: L.icon({
            iconUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.7.1/dist/images/marker-icon.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41]
        })
    }).addTo(mapa).bindPopup(entrega.direccion);
    marcadores.push(marker);
}

function mostrarDirecciones() {
    elementos.listaDirecciones.innerHTML = direcciones
        .map((entrega, index) => `
            <div class="entrega-card">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <strong>${entrega.direccion}</strong>
                        ${rutaOptimizada.length > 0 && rutaOptimizada[0].lat === entrega.lat ? 
                            '<div class="text-primary">PRÓXIMA ENTREGA</div>' : ''}
                    </div>
                    <button onclick="marcarEntregada(${index})" class="btn btn-sm btn-danger">✓</button>
                </div>
            </div>
        `)
        .join('');
}

window.marcarEntregada = function(index) {
    if (confirm(`¿Marcar "${direcciones[index].direccion}" como entregada?`)) {
        direcciones.splice(index, 1);
        guardarLocal();
        mostrarDirecciones();
        actualizarRuta();
    }
};

// APIs externas
async function obtenerDireccionDesdeCoordenadas(lat, lng) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
        const data = await response.json();
        return data.display_name || "Ubicación seleccionada";
    } catch (error) {
        console.error("Geocodificación inversa fallida:", error);
        return "Ubicación en mapa";
    }
}

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
        console.error("Geocodificación fallida:", error);
    }
    return null;
}