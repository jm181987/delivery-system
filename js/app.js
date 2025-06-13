let direcciones = JSON.parse(localStorage.getItem("entregas")) || [];
let mapa;
let marcadores = [];

window.onload = () => {
  mapa = L.map('mapa').setView([0, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
  }).addTo(mapa);

  direcciones.forEach(d => agregarMarcador(d));
  mostrarDirecciones();
};

document.getElementById("agregar").onclick = async () => {
  const input = document.getElementById("direccion");
  const direccion = input.value.trim();
  if (!direccion) return;

  const datos = await geocodificar(direccion);
  if (datos) {
    datos.entregado = false;
    direcciones.push(datos);
    guardarLocal();
    agregarMarcador(datos);
    mostrarDirecciones();
    input.value = "";
  } else {
    alert("No se pudo geocodificar.");
  }
};

document.getElementById("iniciar-gps").onclick = () => {
  if (!navigator.geolocation) {
    alert("Geolocalización no disponible");
    return;
  }

  navigator.geolocation.watchPosition((pos) => {
    const { latitude, longitude } = pos.coords;
    direcciones.forEach((d, i) => {
      const dist = calcularDistancia(latitude, longitude, d.lat, d.lng);
      if (dist < 100 && !d.entregado) {
        alert(`Entregando automáticamente: ${d.direccion}`);
        mapa.removeLayer(marcadores[i]);
        d.entregado = true;
      }
    });
    direcciones = direcciones.filter(d => !d.entregado);
    marcadores = marcadores.filter((m, i) => !direcciones[i]?.entregado);
    guardarLocal();
    mostrarDirecciones();
  }, console.error, { enableHighAccuracy: true });
};

function mostrarDirecciones() {
  const lista = document.getElementById("lista-direcciones");
  lista.innerHTML = "";
  direcciones.forEach((d, i) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <strong>${d.direccion}</strong><br>
      <button onclick="marcarEntregada(${i})">Entregada</button>
    `;
    lista.appendChild(li);
  });
}

function marcarEntregada(index) {
  if (confirm(`¿Marcar "${direcciones[index].direccion}" como entregada?`)) {
    mapa.removeLayer(marcadores[index]);
    direcciones.splice(index, 1);
    marcadores.splice(index, 1);
    guardarLocal();
    mostrarDirecciones();
  }
}

function guardarLocal() {
  localStorage.setItem("entregas", JSON.stringify(direcciones));
}

function agregarMarcador(d) {
  let marker = L.marker([d.lat, d.lng]).addTo(mapa).bindPopup(d.direccion);
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
      lng: parseFloat(data[0].lon)
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
